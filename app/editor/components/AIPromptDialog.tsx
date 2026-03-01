import MarkdownIt from "markdown-it";
import { Slice } from "prosemirror-model";
import * as React from "react";
import { useState, useCallback, useRef, useEffect } from "react";
import styled from "styled-components";
import { SparklesIcon } from "outline-icons";
import { Portal } from "~/components/Portal";
import { s } from "@shared/styles";
import { client } from "~/utils/ApiClient";
import Logger from "~/utils/Logger";
import { useEditor } from "./EditorContext";

const md = new MarkdownIt({ html: false, breaks: true, linkify: true });

type WritingAction =
  | "freeform"
  | "summarize"
  | "translate_ko"
  | "translate_en"
  | "expand"
  | "fix_grammar"
  | "change_tone_formal"
  | "change_tone_casual"
  | "simplify";

type Props = {
  /** Whether the dialog is open. */
  isOpen: boolean;
  /** The action to perform. */
  action: WritingAction;
  /** Optional selected text from the editor. */
  selectedText?: string;
  /** Selection range start position. */
  from: number;
  /** Selection range end position. */
  to: number;
  /** Callback to close the dialog. */
  onClose: () => void;
};

/**
 * A dialog component that allows users to input AI writing prompts,
 * preview results, and insert/replace text in the editor.
 */
export function AIPromptDialog({
  isOpen,
  action,
  selectedText,
  from,
  to,
  onClose,
}: Props) {
  const { view, parser } = useEditor();
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const handleGenerate = useCallback(async () => {
    setIsLoading(true);
    setError("");
    setResult("");

    try {
      const res = await client.post("/aiAnswers.write", {
        prompt: prompt || selectedText || "",
        context: selectedText || undefined,
        action,
      });
      setResult((res as { data: { text: string } }).data.text);
    } catch (err) {
      Logger.error("AI writing generation failed", err as Error);
      setError("AI 텍스트 생성에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setIsLoading(false);
    }
  }, [prompt, selectedText, action]);

  const handleClose = useCallback(() => {
    setPrompt("");
    setResult("");
    setError("");
    setIsLoading(false);
    onClose();
  }, [onClose]);

  // Calculate position near the cursor
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    try {
      const coords = view.coordsAtPos(from);

      let top = coords.bottom + 8;
      let left = coords.left;

      // Keep within viewport
      if (left + 480 > window.innerWidth) {
        left = window.innerWidth - 492;
      }
      if (top + 400 > window.innerHeight) {
        top = coords.top - 408;
      }

      setPosition({ top: Math.max(8, top), left: Math.max(8, left) });
    } catch {
      setPosition({ top: 100, left: 100 });
    }

    // Auto-run for preset actions with selected text
    if (action !== "freeform" && selectedText) {
      void handleGenerate();
    }
  }, [isOpen, view, from, action, selectedText, handleGenerate]);

  // Focus input when opened for freeform
  useEffect(() => {
    if (isOpen && action === "freeform" && inputRef.current) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen, action]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClose]);

  const handleInsert = useCallback(() => {
    if (!result) {
      return;
    }

    const { state, dispatch } = view;
    let tr = state.tr;

    // Parse markdown result into ProseMirror nodes
    const parsed = parser.parse(result);

    if (parsed) {
      const content = parsed.content;
      const slice = new Slice(content, 0, 0);

      if (selectedText) {
        // Delete the selected text first, then insert at block boundary
        tr = tr.delete(from, to);
        tr = tr.replaceRange(from, from, slice);
      } else {
        // Resolve position to find the end of current block, then insert after it
        const $pos = tr.doc.resolve(from);
        const insertPos = $pos.after($pos.depth);
        tr = tr.replaceRange(insertPos, insertPos, slice);
      }
    } else {
      // Fallback to plain text if parsing fails
      if (selectedText) {
        tr.insertText(result, from, to);
      } else {
        tr.insertText(result, from);
      }
    }

    dispatch(tr);
    view.focus();
    onClose();
  }, [result, view, parser, from, to, selectedText, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleGenerate();
      }
    },
    [handleGenerate]
  );

  if (!isOpen) {
    return null;
  }

  return (
    <Portal>
      <Backdrop onClick={handleClose} />
      <DialogWrapper
        ref={dialogRef}
        style={{ top: position.top, left: position.left }}
      >
        <Header>
          <SparklesIcon size={18} />
          <HeaderTitle>
            {action === "freeform" ? "AI 작성 도우미" : getActionLabel(action)}
          </HeaderTitle>
        </Header>

        {action === "freeform" && !result && (
          <PromptArea>
            <StyledTextarea
              ref={inputRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="원하는 내용을 설명하세요..."
              rows={3}
              disabled={isLoading}
            />
          </PromptArea>
        )}

        {isLoading && (
          <StatusArea>
            <Spinner />
            <StatusText>생성 중...</StatusText>
          </StatusArea>
        )}

        {error && <ErrorText>{error}</ErrorText>}

        {result && (
          <ResultArea>
            <ResultText
              dangerouslySetInnerHTML={{ __html: md.render(result) }}
            />
          </ResultArea>
        )}

        <ButtonRow>
          {!result && !isLoading && action === "freeform" && (
            <PrimaryButton onClick={handleGenerate} disabled={!prompt.trim()}>
              생성
            </PrimaryButton>
          )}
          {result && (
            <>
              <PrimaryButton onClick={handleInsert}>
                {selectedText ? "대체" : "삽입"}
              </PrimaryButton>
              <SecondaryButton
                onClick={() => {
                  setResult("");
                  void handleGenerate();
                }}
              >
                재생성
              </SecondaryButton>
            </>
          )}
          <SecondaryButton onClick={handleClose}>취소</SecondaryButton>
        </ButtonRow>
      </DialogWrapper>
    </Portal>
  );
}

/** Get a human-readable label for a writing action. */
function getActionLabel(action: WritingAction): string {
  const labels: Record<WritingAction, string> = {
    freeform: "AI 작성 도우미",
    summarize: "요약하기",
    translate_ko: "한국어로 번역",
    translate_en: "영어로 번역",
    expand: "확장하기",
    fix_grammar: "맞춤법 교정",
    change_tone_formal: "공식적 톤으로",
    change_tone_casual: "캐주얼 톤으로",
    simplify: "간결하게",
  };
  return labels[action];
}

const Backdrop = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 999;
`;

const DialogWrapper = styled.div`
  position: fixed;
  z-index: 1000;
  width: 480px;
  max-height: 520px;
  background: ${s("menuBackground")};
  border: 1px solid ${s("divider")};
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid ${s("divider")};
  color: ${s("text")};
`;

const HeaderTitle = styled.span`
  font-size: 14px;
  font-weight: 600;
`;

const PromptArea = styled.div`
  padding: 12px 16px;
`;

const StyledTextarea = styled.textarea`
  width: 100%;
  border: 1px solid ${s("inputBorder")};
  border-radius: 4px;
  padding: 8px;
  font-size: 14px;
  font-family: inherit;
  background: ${s("background")};
  color: ${s("text")};
  resize: none;
  outline: none;
  box-sizing: border-box;

  &:focus {
    border-color: ${s("accent")};
  }

  &:disabled {
    opacity: 0.6;
  }
`;

const StatusArea = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  justify-content: center;
`;

const Spinner = styled.div`
  width: 16px;
  height: 16px;
  border: 2px solid ${s("divider")};
  border-top-color: ${s("accent")};
  border-radius: 50%;
  animation: spin 0.6s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const StatusText = styled.span`
  font-size: 13px;
  color: ${s("textTertiary")};
`;

const ErrorText = styled.div`
  padding: 8px 16px;
  font-size: 13px;
  color: ${s("danger")};
`;

const ResultArea = styled.div`
  padding: 12px 16px;
  max-height: 340px;
  overflow-y: auto;
`;

const ResultText = styled.div`
  font-size: 14px;
  line-height: 1.6;
  color: ${s("text")};
  word-break: break-word;

  > *:first-child {
    margin-top: 0;
  }

  > *:last-child {
    margin-bottom: 0;
  }

  h1,
  h2,
  h3 {
    margin: 12px 0 6px;
    font-weight: 600;
    line-height: 1.3;
  }

  h1 {
    font-size: 1.2em;
  }

  h2 {
    font-size: 1.1em;
  }

  h3 {
    font-size: 1em;
  }

  p {
    margin: 6px 0;
  }

  strong {
    font-weight: 600;
  }

  code {
    background: ${s("codeBackground")};
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 13px;
  }

  pre {
    background: ${s("codeBackground")};
    border-radius: 4px;
    padding: 8px;
    overflow-x: auto;
    margin: 6px 0;

    code {
      background: none;
      padding: 0;
    }
  }

  ul,
  ol {
    margin: 6px 0;
    padding-left: 20px;
  }

  li {
    margin: 2px 0;
  }

  blockquote {
    border-left: 3px solid ${s("textTertiary")};
    margin: 6px 0;
    padding: 2px 10px;
    color: ${s("textSecondary")};
  }

  hr {
    border: none;
    border-top: 1px solid ${s("divider")};
    margin: 8px 0;
  }

  table {
    border-collapse: collapse;
    margin: 6px 0;
    width: 100%;
  }

  th,
  td {
    border: 1px solid ${s("divider")};
    padding: 4px 8px;
    text-align: left;
    font-size: 13px;
  }

  th {
    background: ${s("sidebarBackground")};
    font-weight: 600;
  }

  a {
    color: ${s("accent")};
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }
`;

const ButtonRow = styled.div`
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid ${s("divider")};
  justify-content: flex-end;
`;

const PrimaryButton = styled.button`
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: ${s("accent")};
  color: white;

  &:hover {
    opacity: 0.9;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const SecondaryButton = styled.button`
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid ${s("divider")};
  border-radius: 4px;
  cursor: pointer;
  background: ${s("background")};
  color: ${s("text")};

  &:hover {
    background: ${s("listItemHoverBackground")};
  }
`;

export default AIPromptDialog;
