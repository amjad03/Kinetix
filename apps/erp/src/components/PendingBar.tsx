/** A thin bar across the top of the window while a URL change is loading. */
export function PendingBar({ label }: { label?: string }) {
  return (
    <div role="progressbar" aria-label={label} className="fixed inset-x-0 top-0 z-[2000] h-[3px] overflow-hidden bg-teal-soft">
      <div className="h-full w-1/3 animate-[kx-slide_1s_ease-in-out_infinite] bg-teal" />
    </div>
  );
}
