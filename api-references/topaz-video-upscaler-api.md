# Topaz Video Upscaler — API Reference

Base URL: `https://api.muapi.ai/api/v1`  
Authentication: `x-api-key` header

---

## Endpoints

### POST `/topaz-video-upscale`

Submit a video upscaling task.

#### Request Headers

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `x-api-key` | `YOUR_API_KEY` |

#### Request Body

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `video_url` | string | ✅ Yes | — | URL of the video to upscale |
| `upscale_factor` | int | No | `2` | Factor to upscale by. `1` = no change, `2` = double width & height, `4` = quadruple resolution |

**Allowed values for `upscale_factor`:** `1`, `2`, `4`

#### Example Request

```bash
curl --location --request POST "https://api.muapi.ai/api/v1/topaz-video-upscale" \
  --header "Content-Type: application/json" \
  --header "x-api-key: YOUR_API_KEY" \
  --data-raw '{
    "video_url": "https://d3adwkbyhxyrtq.cloudfront.net/webassets/videomodels/topaz-upscaler-in.mp4",
    "upscale_factor": 2
  }'
```

#### Response Body

| Field | Type | Description |
|---|---|---|
| `request_id` | string | The prediction request ID (use this to poll for results) |
| `status` | string | Prediction status |
| `output` | object | Prediction output object |
| `output.id` | string | Prediction request ID |
| `output.urls` | object | URL object |
| `output.urls.get` | string | URL to retrieve the prediction result |
| `output.error` | string | Error message if the prediction failed |
| `output.status` | string | Status of the prediction (e.g. `completed`, `failed`) |
| `output.outputs` | array | List of output URLs |
| `output.timings` | object | Timing information |
| `output.timings.inference` | number | Inference time in seconds |
| `output.created_at` | string | Timestamp when the prediction was created |
| `output.has_nsfw_contents` | array | List indicating NSFW content presence per output |

---

### GET `/predictions/{request_id}/result`

Poll for the result of a submitted upscaling task.

#### Request Headers

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `x-api-key` | `YOUR_API_KEY` |

#### Path Parameters

| Parameter | Type | Description |
|---|---|---|
| `request_id` | string | The `request_id` returned from the submit endpoint |

#### Example Request

```bash
curl --location --request GET "https://api.muapi.ai/api/v1/predictions/${request_id}/result" \
  --header "Content-Type: application/json" \
  --header "x-api-key: YOUR_API_KEY"
```

---

## Implementation Guide

1. **Prepare your video URL** — The video must be publicly accessible online (e.g. `https://example.com/video.mp4`).

2. **Select an upscale factor** — Choose `1` (no change), `2` (2× resolution, default), or `4` (4× resolution).

3. **Submit the task** — POST to `/topaz-video-upscale` with your `video_url` and `upscale_factor`. Save the returned `request_id`.

4. **Poll for results** — GET `/predictions/{request_id}/result` until `output.status` is `completed` or `failed`. Processing time varies with video size and upscale factor.

5. **Retrieve your video** — The upscaled video URL is available in `output.outputs` once the status is `completed`.

6. **Review the output** — Check the quality and resolution to confirm it meets your requirements.

---

## Full Example (Submit + Poll)

```bash
# 1. Submit
RESPONSE=$(curl -s --request POST "https://api.muapi.ai/api/v1/topaz-video-upscale" \
  --header "Content-Type: application/json" \
  --header "x-api-key: YOUR_API_KEY" \
  --data-raw '{
    "video_url": "https://d3adwkbyhxyrtq.cloudfront.net/webassets/videomodels/topaz-upscaler-in.mp4",
    "upscale_factor": 2
  }')

REQUEST_ID=$(echo $RESPONSE | jq -r '.request_id')

# 2. Poll for result
curl --request GET "https://api.muapi.ai/api/v1/predictions/${REQUEST_ID}/result" \
  --header "Content-Type: application/json" \
  --header "x-api-key: YOUR_API_KEY"
```
