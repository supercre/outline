import { useCallback, useState } from "react";
import type { MenuItem } from "@shared/editor/types";
import useDictionary from "~/hooks/useDictionary";
import getMenuItems from "../menus/block";
import { useEditor } from "./EditorContext";
import type { Props as SuggestionsMenuProps } from "./SuggestionsMenu";
import SuggestionsMenu from "./SuggestionsMenu";
import SuggestionsMenuItem from "./SuggestionsMenuItem";
import { AIPromptDialog } from "./AIPromptDialog";

type Props = Omit<SuggestionsMenuProps, "renderMenuItem" | "items"> &
  Required<Pick<SuggestionsMenuProps, "embeds">>;

function BlockMenu(props: Props) {
  const dictionary = useDictionary();
  const { elementRef, view } = useEditor();
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiCursorPos, setAiCursorPos] = useState(0);

  const renderMenuItem = useCallback(
    (item, _index, options) => (
      <SuggestionsMenuItem
        {...options}
        icon={item.icon}
        title={item.title}
        shortcut={item.shortcut}
      />
    ),
    []
  );

  const handleSelect = useCallback(
    (item: MenuItem) => {
      const attrs =
        typeof item.attrs === "function" ? item.attrs(view.state) : item.attrs;
      if (attrs && "type" in attrs && attrs.type === "ai_write") {
        const { from } = view.state.selection;
        setAiCursorPos(from);
        // Small delay to let the slash menu close and search text clear
        requestAnimationFrame(() => {
          setAiDialogOpen(true);
        });
      }
    },
    [view]
  );

  const handleAiClose = useCallback(() => {
    setAiDialogOpen(false);
  }, []);

  return (
    <>
      <SuggestionsMenu
        {...props}
        filterable
        trigger="/"
        renderMenuItem={renderMenuItem}
        items={getMenuItems(dictionary, elementRef)}
        onSelect={handleSelect}
      />
      <AIPromptDialog
        isOpen={aiDialogOpen}
        action="freeform"
        from={aiCursorPos}
        to={aiCursorPos}
        onClose={handleAiClose}
      />
    </>
  );
}

export default BlockMenu;
