export interface AiAnswerGenerateRequest {
  query: string;
  searchQueryId?: string;
}

export interface AiAnswerGenerateResponse {
  searchQueryId: string;
  status: "processing" | "complete";
  answer?: string;
}

export interface AiAnswerStatusRequest {
  searchQueryId: string;
}

export interface AiAnswerStatusResponse {
  status: "processing" | "complete";
  answer?: string;
}
