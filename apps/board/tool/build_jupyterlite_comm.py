"""Builds the `comm` wheel the bundled JupyterLite needs to start Python offline.

The Pyodide kernel (pyodide_kernel 0.8.6) imports `comm` when it starts. JupyterLite normally
fetches it from PyPI, so on a board with no internet the Python console never started. This
writes a small `comm` (the same API as the `comm` package: BaseComm, CommManager, create_comm,
get_comm_manager) into the kernel's piplite index, where piplite finds it before PyPI.

    python3 tool/build_jupyterlite_comm.py

Version 0.2.999 follows JupyterLite's own convention for in-browser stand-ins
(widgetsnbextension 3.6.999 / 4.0.999 in the same folder).
"""

import base64
import hashlib
import io
import json
import os
import zipfile

VERSION = '0.2.999'
HERE = os.path.dirname(os.path.abspath(__file__))
PYPI = os.path.join(HERE, '..', 'assets', 'simhub', 'jupyterlite', 'extensions', '@jupyterlite', 'pyodide-kernel-extension', 'static', 'pypi')

SOURCE = '''"""Jupyter comms for the Pyodide kernel in the KINETIX board's JupyterLite.

The same API as the `comm` package (BaseComm, CommManager, create_comm, get_comm_manager), so
pyodide_kernel and widget libraries work without fetching it from PyPI.
"""

import logging
import sys
import uuid

__version__ = "%s"
__all__ = ["BaseComm", "CommManager", "create_comm", "get_comm_manager", "__version__"]

logger = logging.getLogger("Comm")


def _module():
    """This module, so a kernel's replacement create_comm / get_comm_manager is the one used."""
    return sys.modules[__name__]


class BaseComm:
    """One end of a comm. Subclasses send messages by overriding publish_msg."""

    def __init__(self, target_name="comm", data=None, metadata=None, buffers=None, comm_id=None,
                 primary=True, target_module=None, topic=None, _open_data=None, _close_data=None, **kwargs):
        super().__init__(**kwargs)
        self.comm_id = comm_id or uuid.uuid4().hex
        self.primary = primary
        self.target_name = target_name
        self.target_module = target_module
        self.topic = topic or ("comm-%%s" %% self.comm_id).encode("ascii")
        self._open_data = _open_data or {}
        self._close_data = _close_data or {}
        self._msg_callback = None
        self._close_callback = None
        self._closed = True
        if self.primary:
            self.open(data=data, metadata=metadata, buffers=buffers)
        else:
            self._closed = False

    def publish_msg(self, msg_type, data=None, metadata=None, buffers=None, **keys):
        raise NotImplementedError("publish_msg")

    def __del__(self):
        try:
            self.close(deleting=True)
        except Exception:
            pass

    def open(self, data=None, metadata=None, buffers=None):
        """Registers the comm and tells the front end it is open."""
        manager = _module().get_comm_manager()
        manager.register_comm(self)
        try:
            self.publish_msg("comm_open", data=self._open_data if data is None else data, metadata=metadata,
                             buffers=buffers, target_name=self.target_name, target_module=self.target_module)
            self._closed = False
        except Exception:
            manager.unregister_comm(self)
            raise

    def close(self, data=None, metadata=None, buffers=None, deleting=False):
        """Tells the front end the comm is closed; once only."""
        if self._closed:
            return
        self._closed = True
        self.publish_msg("comm_close", data=self._close_data if data is None else data, metadata=metadata, buffers=buffers)
        if not deleting:
            _module().get_comm_manager().unregister_comm(self)

    def send(self, data=None, metadata=None, buffers=None):
        self.publish_msg("comm_msg", data=data, metadata=metadata, buffers=buffers)

    def on_close(self, callback):
        self._close_callback = callback

    def on_msg(self, callback):
        self._msg_callback = callback

    def handle_close(self, msg):
        if self._close_callback:
            self._close_callback(msg)

    def handle_msg(self, msg):
        if not self._msg_callback:
            return
        shell = None
        try:
            from IPython import get_ipython
            shell = get_ipython()
        except Exception:
            pass
        if shell is not None:
            shell.events.trigger("pre_execute")
        self._msg_callback(msg)
        if shell is not None:
            shell.events.trigger("post_execute")


class CommManager:
    """Keeps the open comms and the targets that front ends may open comms to."""

    def __init__(self):
        self.comms = {}
        self.targets = {}

    def register_target(self, target_name, f):
        if isinstance(f, str):
            module, _, name = f.rpartition(".")
            f = getattr(__import__(module, fromlist=[name]), name)
        self.targets[target_name] = f

    def unregister_target(self, target_name, f):
        return self.targets.pop(target_name)

    def register_comm(self, comm):
        self.comms[comm.comm_id] = comm
        return comm.comm_id

    def unregister_comm(self, comm):
        self.comms.pop(comm.comm_id, None)

    def get_comm(self, comm_id):
        comm = self.comms.get(comm_id)
        if comm is None:
            logger.warning("No such comm: %%s", comm_id)
        return comm

    def comm_open(self, stream, ident, msg):
        """A front end opened a comm to one of our targets."""
        content = msg["content"]
        comm_id = content["comm_id"]
        target_name = content["target_name"]
        comm = _module().create_comm(comm_id=comm_id, primary=False, target_name=target_name)
        self.register_comm(comm)
        f = self.targets.get(target_name)
        if f is None:
            logger.error("No such comm target registered: %%s", target_name)
        else:
            try:
                f(comm, msg)
                return
            except Exception:
                logger.error("Exception opening comm with target: %%s", target_name, exc_info=True)
        try:
            comm.close()
        except Exception:
            pass
        self.unregister_comm(comm)

    def comm_msg(self, stream, ident, msg):
        comm_id = msg["content"]["comm_id"]
        comm = self.get_comm(comm_id)
        if comm is None:
            return
        try:
            comm.handle_msg(msg)
        except Exception:
            logger.error("Exception in comm_msg for %%s", comm_id, exc_info=True)

    def comm_close(self, stream, ident, msg):
        comm_id = msg["content"]["comm_id"]
        comm = self.get_comm(comm_id)
        if comm is None:
            return
        comm._closed = True
        self.comms.pop(comm_id, None)
        try:
            comm.handle_close(msg)
        except Exception:
            logger.error("Exception in comm_close for %%s", comm_id, exc_info=True)


class DummyComm(BaseComm):
    """What create_comm gives until a kernel replaces it (pyodide_kernel does)."""

    def publish_msg(self, msg_type, data=None, metadata=None, buffers=None, **keys):
        pass


_comm_manager = None


def _create_comm(*args, **kwargs):
    return DummyComm(*args, **kwargs)


def _get_comm_manager():
    global _comm_manager
    if _comm_manager is None:
        _comm_manager = CommManager()
    return _comm_manager


# Kernels replace these module attributes (pyodide_kernel sets comm.create_comm).
create_comm = _create_comm
get_comm_manager = _get_comm_manager
''' % VERSION

METADATA = f'''Metadata-Version: 2.1
Name: comm
Version: {VERSION}
Summary: Jupyter comms for the KINETIX board's offline JupyterLite (same API as the comm package)
License: BSD-3-Clause
Requires-Python: >=3.8
'''

WHEEL = '''Wheel-Version: 1.0
Generator: kinetix build_jupyterlite_comm.py
Root-Is-Purelib: true
Tag: py3-none-any
'''


def _record_line(name, data):
    digest = base64.urlsafe_b64encode(hashlib.sha256(data).digest()).rstrip(b'=').decode()
    return f'{name},sha256={digest},{len(data)}'


def build():
    info = f'comm-{VERSION}.dist-info'
    files = {
        'comm/__init__.py': SOURCE.encode(),
        f'{info}/METADATA': METADATA.encode(),
        f'{info}/WHEEL': WHEEL.encode(),
    }
    record = '\n'.join([_record_line(n, d) for n, d in files.items()] + [f'{info}/RECORD,,']) + '\n'
    files[f'{info}/RECORD'] = record.encode()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as z:
        for name, data in files.items():
            # A fixed date keeps the wheel (and its digest) the same on every build.
            zi = zipfile.ZipInfo(name, date_time=(2026, 10, 13, 0, 0, 0))
            zi.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(zi, data)
    wheel = buf.getvalue()
    name = f'comm-{VERSION}-py3-none-any.whl'
    with open(os.path.join(PYPI, name), 'wb') as f:
        f.write(wheel)

    index_path = os.path.join(PYPI, 'all.json')
    with open(index_path) as f:
        index = json.load(f)
    index['comm'] = {
        'releases': {
            VERSION: [{
                'comment_text': '',
                'digests': {'md5': hashlib.md5(wheel).hexdigest(), 'sha256': hashlib.sha256(wheel).hexdigest()},
                'downloads': -1,
                'filename': name,
                'has_sig': False,
                'md5_digest': hashlib.md5(wheel).hexdigest(),
                'packagetype': 'bdist_wheel',
                'python_version': 'py3',
                'requires_python': '>=3.8',
                'size': len(wheel),
                'upload_time': '2026-10-13T00:00:00.000000Z',
                'upload_time_iso_8601': '2026-10-13T00:00:00.000000Z',
                'url': f'./{name}',
                'yanked': False,
                'yanked_reason': None,
            }]
        }
    }
    with open(index_path, 'w') as f:
        json.dump(dict(sorted(index.items())), f, indent=2)
        f.write('\n')
    print(f'{name}: {len(wheel)} bytes')


if __name__ == '__main__':
    build()
