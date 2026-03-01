import MarkdownIt from "markdown-it";
import * as React from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import { s } from "@shared/styles";
import Flex from "~/components/Flex";
import Text from "~/components/Text";
import { client } from "~/utils/ApiClient";
import Logger from "~/utils/Logger";

const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
});

interface AiAnswerProps {
  query: string;
}

/**
 * Component that displays an AI-generated answer for a search query.
 * Polls the server for the answer status until it's complete.
 */
function AiAnswer({ query }: AiAnswerProps) {
  const { t } = useTranslation();
  const [answer, setAnswer] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<
    "idle" | "loading" | "complete" | "error"
  >("idle");
  const [expanded, setExpanded] = React.useState(true);
  const searchQueryIdRef = React.useRef<string | null>(null);
  const pollCountRef = React.useRef(0);

  React.useEffect(() => {
    if (!query) {
      setStatus("idle");
      setAnswer(null);
      return;
    }

    let cancelled = false;
    searchQueryIdRef.current = null;
    pollCountRef.current = 0;
    setStatus("loading");
    setAnswer(null);

    const generate = async () => {
      try {
        const res = await client.post("/aiAnswers.generate", { query });
        if (cancelled) {
          return;
        }

        const {
          searchQueryId,
          status: resStatus,
          answer: resAnswer,
        } = res.data;
        searchQueryIdRef.current = searchQueryId;

        if (resStatus === "complete" && resAnswer) {
          setAnswer(resAnswer);
          setStatus("complete");
          return;
        }

        // Start polling
        const poll = async () => {
          if (cancelled || pollCountRef.current >= 15) {
            if (!cancelled) {
              setStatus("error");
            }
            return;
          }

          pollCountRef.current += 1;

          try {
            const pollRes = await client.post("/aiAnswers.status", {
              searchQueryId,
            });

            if (cancelled) {
              return;
            }

            if (pollRes.status === "complete" || pollRes.data?.answer) {
              setAnswer(pollRes.data?.answer ?? pollRes.data?.query);
              setStatus("complete");
              return;
            }

            // Poll again after 2 seconds
            setTimeout(poll, 2000);
          } catch (err) {
            if (!cancelled) {
              Logger.warn("AI answer polling failed", err);
              setStatus("error");
            }
          }
        };

        setTimeout(poll, 2000);
      } catch (err) {
        if (!cancelled) {
          Logger.warn("AI answer generation failed", err);
          setStatus("error");
        }
      }
    };

    void generate();

    return () => {
      cancelled = true;
    };
  }, [query]);

  if (status === "idle") {
    return null;
  }

  return (
    <Container>
      <Header
        align="center"
        justify="space-between"
        onClick={() => setExpanded((v) => !v)}
      >
        <HeaderTitle>
          <AiIcon>AI</AiIcon>
          {t("AI Answer")}
        </HeaderTitle>
        <ExpandButton>{expanded ? "▲" : "▼"}</ExpandButton>
      </Header>
      {expanded && (
        <Content>
          {status === "loading" && (
            <LoadingText type="secondary">
              {t("Generating answer")}…
            </LoadingText>
          )}
          {status === "error" && (
            <Text type="secondary">
              {t("Failed to generate an answer. Please try again.")}
            </Text>
          )}
          {status === "complete" && answer && (
            <AnswerText
              dangerouslySetInnerHTML={{ __html: md.render(answer) }}
            />
          )}
        </Content>
      )}
    </Container>
  );
}

const Container = styled.div`
  border: 1px solid ${s("divider")};
  border-radius: 8px;
  margin-bottom: 16px;
  overflow: hidden;
`;

const Header = styled(Flex)`
  padding: 10px 16px;
  cursor: pointer;
  user-select: none;
  background: ${s("sidebarBackground")};

  &:hover {
    opacity: 0.9;
  }
`;

const HeaderTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
`;

const AiIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: ${s("accent")};
  color: white;
  font-size: 10px;
  font-weight: 700;
  border-radius: 4px;
  padding: 2px 6px;
  line-height: 1;
`;

const ExpandButton = styled.span`
  font-size: 12px;
  color: ${s("textTertiary")};
`;

const Content = styled.div`
  padding: 12px 16px;
`;

const LoadingText = styled(Text)`
  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }
  animation: pulse 1.5s ease-in-out infinite;
`;

const AnswerText = styled.div`
  font-size: 14px;
  line-height: 1.6;
  color: ${s("text")};

  > *:first-child {
    margin-top: 0;
  }

  > *:last-child {
    margin-bottom: 0;
  }

  h1,
  h2,
  h3,
  h4 {
    margin: 16px 0 8px;
    font-weight: 600;
    line-height: 1.3;
  }

  h1 {
    font-size: 1.3em;
  }

  h2 {
    font-size: 1.15em;
  }

  h3 {
    font-size: 1.05em;
  }

  p {
    margin: 8px 0;
  }

  strong {
    font-weight: 600;
  }

  code {
    background: ${s("codeBackground")};
    padding: 2px 4px;
    border-radius: 3px;
    font-size: 13px;
  }

  pre {
    background: ${s("codeBackground")};
    border-radius: 6px;
    padding: 12px;
    overflow-x: auto;
    margin: 8px 0;

    code {
      background: none;
      padding: 0;
      border-radius: 0;
      font-size: 13px;
    }
  }

  ul,
  ol {
    margin: 8px 0;
    padding-left: 24px;
  }

  li {
    margin: 4px 0;
  }

  blockquote {
    border-left: 3px solid ${s("textTertiary")};
    margin: 8px 0;
    padding: 4px 12px;
    color: ${s("textSecondary")};
  }

  hr {
    border: none;
    border-top: 1px solid ${s("divider")};
    margin: 12px 0;
  }

  table {
    border-collapse: collapse;
    margin: 8px 0;
    width: 100%;
  }

  th,
  td {
    border: 1px solid ${s("divider")};
    padding: 6px 10px;
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

export default AiAnswer;
