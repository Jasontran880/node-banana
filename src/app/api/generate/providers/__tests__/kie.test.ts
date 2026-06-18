import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetKieProviderStateForTests, uploadImageToKie } from "../kie";

const originalEnv = { ...process.env };
const jpegDataUrl = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0x00]).toString("base64")}`;

function uploadSuccessResponse(url: string): Response {
  return new Response(JSON.stringify({
    success: true,
    code: 200,
    data: { downloadUrl: url },
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Kie provider upload handling", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      KIE_FETCH_MAX_ATTEMPTS: "3",
      KIE_RETRY_BASE_DELAY_MS: "0",
      KIE_UPLOAD_TIMEOUT_MS: "60000",
    };
    __resetKieProviderStateForTests();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    __resetKieProviderStateForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    process.env = originalEnv;
  });

  it("retries Kie image upload after an Undici headers timeout", async () => {
    const timeoutError = new TypeError("fetch failed") as Error & { cause?: unknown };
    timeoutError.cause = {
      name: "HeadersTimeoutError",
      code: "UND_ERR_HEADERS_TIMEOUT",
      message: "Headers Timeout Error",
    };

    mockFetch
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValueOnce(uploadSuccessResponse("https://cdn.kie.ai/output/retry.jpg"));

    const result = await uploadImageToKie("req-retry", "kie-key", jpegDataUrl);

    expect(result).toBe("https://cdn.kie.ai/output/retry.jpg");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("deduplicates simultaneous Kie image uploads for the same base64 image", async () => {
    let resolveUpload: (response: Response) => void = () => {};
    mockFetch.mockReturnValueOnce(new Promise<Response>((resolve) => {
      resolveUpload = resolve;
    }));

    const firstUpload = uploadImageToKie("req-1", "kie-key", jpegDataUrl);
    const secondUpload = uploadImageToKie("req-2", "kie-key", jpegDataUrl);

    expect(mockFetch).toHaveBeenCalledTimes(1);

    resolveUpload(uploadSuccessResponse("https://cdn.kie.ai/output/deduped.jpg"));

    await expect(Promise.all([firstUpload, secondUpload])).resolves.toEqual([
      "https://cdn.kie.ai/output/deduped.jpg",
      "https://cdn.kie.ai/output/deduped.jpg",
    ]);
  });
});
