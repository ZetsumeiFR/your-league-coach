import { ENV } from "../env";

export interface CoachSettings {
  accessKey: string;
  serverUrl: string;
}

export function getCoachSettings(): CoachSettings {
  return { serverUrl: ENV.VITE_SERVER_URL, accessKey: "" };
}
