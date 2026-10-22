import { distributionUrl } from "@aihot/contracts/distribution";
import { recordEngagement } from "../../lib/engagement.ts";

export async function shareOrCopy(title: string, url: string): Promise<"shared" | "copied" | null> {
  try {
    url = distributionUrl(url, "share");
    let result: "shared" | "copied";
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      await navigator.share({ title, url });
      result = "shared";
    } else {
      await navigator.clipboard.writeText(`${title}\n${url}`);
      result = "copied";
    }
    recordEngagement("share_click");
    return result;
  } catch {
    return null;
  }
}
