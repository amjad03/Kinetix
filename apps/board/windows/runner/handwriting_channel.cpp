#include "handwriting_channel.h"

#include <flutter/method_channel.h>
#include <flutter/standard_method_codec.h>

#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Foundation.Numerics.h>
#include <winrt/Windows.UI.Input.Inking.h>

#include <cwctype>
#include <memory>
#include <optional>
#include <string>
#include <utility>
#include <vector>

namespace {

namespace foundation = winrt::Windows::Foundation;
namespace inking = winrt::Windows::UI::Input::Inking;
using flutter::EncodableList;
using flutter::EncodableMap;
using flutter::EncodableValue;
using Result = flutter::MethodResult<EncodableValue>;

std::unique_ptr<flutter::MethodChannel<EncodableValue>> g_channel;
HWND g_window = nullptr;

// A recognition on its way back to the platform thread.
struct Pending {
  std::unique_ptr<Result> result;
  std::vector<std::vector<std::string>> words;
  std::string error;
};

// Words in a recogniser's name that say which board language it reads. Names follow the
// Windows display language, so the languages' own names are listed too.
struct Language {
  const char* tag;
  std::vector<std::wstring> names;
};

const std::vector<Language>& Languages() {
  static const std::vector<Language> languages = {
      {"en", {L"english"}},
      {"hi", {L"hindi", L"हिन्दी", L"हिंदी"}},
      {"kn", {L"kannada", L"ಕನ್ನಡ"}},
  };
  return languages;
}

std::wstring Lower(std::wstring s) {
  for (auto& c : s) c = static_cast<wchar_t>(std::towlower(c));
  return s;
}

// The installed recogniser for board language |tag| ("en", "hi", "kn"), if Windows has one.
// English prefers English (India).
std::optional<inking::InkRecognizer> FindRecognizer(const std::string& tag) {
  const Language* language = nullptr;
  for (const auto& l : Languages()) {
    if (tag == l.tag) language = &l;
  }
  if (!language) return std::nullopt;
  std::optional<inking::InkRecognizer> found;
  inking::InkRecognizerContainer container;
  for (const auto& r : container.GetRecognizers()) {
    const std::wstring name = Lower(std::wstring(r.Name()));
    for (const auto& n : language->names) {
      if (name.find(n) == std::wstring::npos) continue;
      if (!found || name.find(L"india") != std::wstring::npos) found = r;
    }
  }
  return found;
}

void ListLanguages(std::unique_ptr<Result> result) {
  EncodableList out;
  try {
    for (const auto& l : Languages()) {
      if (FindRecognizer(l.tag)) out.emplace_back(std::string(l.tag));
    }
  } catch (const winrt::hresult_error&) {
    // No inking on this edition of Windows: no languages, and words stay as ink.
  }
  result->Success(EncodableValue(out));
}

void Recognize(const EncodableMap& args, std::unique_ptr<Result> result) {
  const auto language_it = args.find(EncodableValue("language"));
  const auto strokes_it = args.find(EncodableValue("strokes"));
  if (language_it == args.end() || strokes_it == args.end() || !std::holds_alternative<std::string>(language_it->second) ||
      !std::holds_alternative<EncodableList>(strokes_it->second)) {
    result->Error("bad_args", "recognize needs a language and strokes");
    return;
  }
  try {
    const auto recognizer = FindRecognizer(std::get<std::string>(language_it->second));
    if (!recognizer) {
      result->Success(EncodableValue(EncodableList{}));
      return;
    }
    inking::InkManager manager;
    manager.SetDefaultRecognizer(*recognizer);
    inking::InkStrokeBuilder builder;
    for (const auto& stroke : std::get<EncodableList>(strokes_it->second)) {
      const auto* xy = std::get_if<EncodableList>(&stroke);
      if (!xy) continue;
      std::vector<inking::InkPoint> points;
      for (size_t i = 0; i + 1 < xy->size(); i += 2) {
        const auto* x = std::get_if<double>(&(*xy)[i]);
        const auto* y = std::get_if<double>(&(*xy)[i + 1]);
        if (x && y) points.emplace_back(foundation::Point{static_cast<float>(*x), static_cast<float>(*y)}, 0.5f);
      }
      if (points.empty()) continue;
      // A dot (the i's, the decimal point) is still a stroke.
      if (points.size() == 1) points.push_back(points.front());
      manager.AddStroke(builder.CreateStrokeFromInkPoints(winrt::single_threaded_vector(std::move(points)), foundation::Numerics::float3x2::identity()));
    }
    auto operation = manager.RecognizeAsync(inking::InkRecognitionTarget::All);
    auto* pending = new Pending{std::move(result), {}, {}};
    // Finishes on a thread-pool thread; the reply goes back through the window. |manager| is
    // held by the handler until then.
    try {
      operation.Completed([pending, manager](const foundation::IAsyncOperation<foundation::Collections::IVectorView<inking::InkRecognitionResult>>& op,
                                           foundation::AsyncStatus status) {
      (void)manager;  // kept alive until the recognition is done
      try {
        if (status == foundation::AsyncStatus::Completed) {
          for (const auto& word : op.GetResults()) {
            std::vector<std::string> readings;
            for (const auto& text : word.GetTextCandidates()) readings.push_back(winrt::to_string(text));
            pending->words.push_back(std::move(readings));
          }
        } else {
          pending->error = "recognition did not complete";
        }
      } catch (const winrt::hresult_error& e) {
        pending->error = winrt::to_string(e.message());
      }
      if (!g_window || !PostMessage(g_window, kHandwritingResultMessage, 0, reinterpret_cast<LPARAM>(pending))) {
        // The window is gone: nobody is waiting for the answer.
        delete pending;
      }
    });
    } catch (const winrt::hresult_error& e) {
      pending->result->Error("recognize_failed", winrt::to_string(e.message()));
      delete pending;
    }
  } catch (const winrt::hresult_error& e) {
    if (result) result->Error("recognize_failed", winrt::to_string(e.message()));
  }
}

}  // namespace

void RegisterHandwritingChannel(flutter::BinaryMessenger* messenger, HWND window) {
  g_window = window;
  g_channel = std::make_unique<flutter::MethodChannel<EncodableValue>>(messenger, "kinetix/handwriting", &flutter::StandardMethodCodec::GetInstance());
  g_channel->SetMethodCallHandler([](const flutter::MethodCall<EncodableValue>& call, std::unique_ptr<Result> result) {
    if (call.method_name() == "languages") {
      ListLanguages(std::move(result));
    } else if (call.method_name() == "recognize") {
      const auto* args = std::get_if<EncodableMap>(call.arguments());
      if (!args) {
        result->Error("bad_args", "recognize needs a map");
        return;
      }
      Recognize(*args, std::move(result));
    } else {
      result->NotImplemented();
    }
  });
}

bool HandleHandwritingMessage(UINT message, WPARAM, LPARAM lparam) {
  if (message != kHandwritingResultMessage) return false;
  std::unique_ptr<Pending> pending(reinterpret_cast<Pending*>(lparam));
  if (!pending || !pending->result) return true;
  if (!pending->error.empty()) {
    pending->result->Error("recognize_failed", pending->error);
    return true;
  }
  EncodableList words;
  for (const auto& readings : pending->words) {
    EncodableList list;
    for (const auto& r : readings) list.emplace_back(r);
    words.emplace_back(std::move(list));
  }
  pending->result->Success(EncodableValue(std::move(words)));
  return true;
}

void UnregisterHandwritingChannel() {
  if (g_channel) g_channel->SetMethodCallHandler(nullptr);
  g_channel = nullptr;
  g_window = nullptr;
}
