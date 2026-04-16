import { useMemo } from "react";
import { useAppTheme } from "@/components/layout/theme-context";

export function useThemeStyles() {
  const { theme, isDarkTheme } = useAppTheme();

  return useMemo(() => {
    const panelClass = isDarkTheme
      ? "border border-white/12 bg-black/32"
      : "border border-[#e6e8f1] bg-white";

    const subtlePanelClass = isDarkTheme
      ? "border border-white/12 bg-white/[0.03]"
      : "border border-[#eaecf4] bg-[#fafbff]";

    const mutedTextClass = isDarkTheme ? "text-white/62" : "text-[#5c6172]";
    const tinyLabelClass = isDarkTheme ? "text-white/45" : "text-[#73788b]";
    const titleClass = isDarkTheme ? "text-white" : "text-[#11131b]";
    const pageClass = isDarkTheme ? "text-white" : "text-[#141621]";

    const chipClass = isDarkTheme
      ? "border border-white/14 bg-white/[0.04] text-white/82"
      : "border border-[#e1e4f0] bg-white text-[#2a3040]";

    const actionChipClass = isDarkTheme
      ? "border border-violet-300/30 bg-violet-500/14 text-violet-100"
      : "border border-violet-200 bg-violet-50 text-violet-700";

    const inputClass = isDarkTheme
      ? "h-11 w-full rounded-xl border border-white/14 bg-black/40 px-4 text-white outline-none transition placeholder:text-white/40 focus:border-violet-400/50 [color-scheme:dark]"
      : "h-11 w-full rounded-xl border border-[#e1e4f0] bg-white px-4 text-[#11131b] outline-none transition placeholder:text-[#73788b] focus:border-violet-400 [color-scheme:light]";

    const textareaClass = isDarkTheme
      ? "min-h-28 w-full rounded-xl border border-white/14 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-white/40 focus:border-violet-400/50 [color-scheme:dark]"
      : "min-h-28 w-full rounded-xl border border-[#e1e4f0] bg-white px-4 py-3 text-[#11131b] outline-none transition placeholder:text-[#73788b] focus:border-violet-400 [color-scheme:light]";

    return {
      theme,
      isDarkTheme,
      panelClass,
      subtlePanelClass,
      mutedTextClass,
      tinyLabelClass,
      titleClass,
      pageClass,
      chipClass,
      actionChipClass,
      inputClass,
      textareaClass,
    };
  }, [isDarkTheme, theme]);
}
