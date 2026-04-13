# mu-api: Seedance 2.0 Image-to-Video (seedance-v2.0-i2v)

> Source: https://muapi.ai/playground/seedance-v2.0-i2v

Seedance 2.0 is the latest multimodal video generation model by ByteDance, offering advanced camera control, native audio-video sync, and high-resolution output. The I2V mode animates still images into cinematic video clips while preserving the original composition, subject identity, lighting, and style.

---

## Quick Start (cURL)

```bash
# Submit Task
curl --location --request POST "https://api.muapi.ai/api/v1/seedance-v2.0-i2v" \
  --header "Content-Type: application/json" \
  --header "x-api-key: MUAPIAPP_API_KEY" \
  --data-raw '{
    "prompt": "The lightbulb suddenly rockets across the room like a missile, smashing through curtains while water spins violently inside. The fish darts through swirling currents as the bulb ricochets off walls and finally bursts into floating droplets.",
    "images_list": [
        "https://d3adwkbyhxyrtq.cloudfront.net/webassets/videomodels/seedance-v2.0-i2v.jpg"
    ],
    "aspect_ratio": "16:9",
    "duration": 5,
    "quality": "basic",
    "remove_watermark": false
  }'

# Poll for results
curl --location --request GET "https://api.muapi.ai/api/v1/predictions/${request_id}/result" \
  --header "Content-Type: application/json" \
  --header "x-api-key: MUAPIAPP_API_KEY"
```

---

## Authentication

- **Header**: `x-api-key`
- **Value**: Your mu-api API key

---

## Input Parameters (Schema)

| Parameter | Field Name | Type | Required | Enum Values | Default | Description |
|---|---|---|---|---|---|---|
| Prompt | `prompt` | string | **REQUIRED** | — | — | Text prompt describing the video animation. Reference uploaded images using @image1, @image2, … @imageN (1-based, matching the order in images_list). Examples: 'The cat in @image1 walks through a garden', '@image1 transforms into @image2', 'The whale in @image1 meets the ninja in @image2'. The engine automatically converts @imageN to the upstream format《@图N》. Referencing an @imageN not provided will result in a 400 error. |
| Image URLs | `images_list` | array | **REQUIRED** | — | — | Upload up to 9 image URLs. Reference them in the prompt using @image1, @image2, … @image9. The aspect ratio of the reference image takes precedence over the aspect_ratio parameter. **Must be URLs, NOT base64 data URIs.** |
| Aspect Ratio | `aspect_ratio` | string | optional | `"16:9"`, `"9:16"`, `"4:3"`, `"3:4"` | `"16:9"` | Output aspect ratio. Note: if a reference image is provided, its aspect ratio takes precedence. |
| Duration | `duration` | integer | optional | `5`, `10`, `15` | `5` | Video duration in seconds. **Must be exactly 5, 10, or 15 — no other values accepted.** |
| Quality | `quality` | string | optional | `"high"`, `"basic"` | `"basic"` | `basic` = $0.08/sec (fast generation). `high` = $0.15/sec (cinema-grade, richer motion detail). |
| Remove Watermark | `remove_watermark` | boolean | optional | — | `false` | Remove watermark from the generated video. |

### Critical implementation notes:
- `images_list` **must be an array of URL strings** (e.g., `["https://..."]`), not base64 data URIs. If your system uses base64 images internally, you must upload them to a CDN first and pass the resulting URL.
- `duration` **must be the integer** `5`, `10`, or `15`. Sending any other value (e.g., `8`) will result in a validation error.
- If you use `@imageN` references in the prompt but don't provide that many images in `images_list`, the API returns a 400 error.
- If you don't use `@imageN` references in the prompt, all provided images are used as general style/subject references.

---

## Output Schema

### Submit response (POST):

| Field | Type | Description |
|---|---|---|
| `request_id` | string | Prediction request ID — use this to poll for results |
| `status` | string | Prediction status |

### Poll response (GET `/api/v1/predictions/{request_id}/result`):

| Field | Type | Description |
|---|---|---|
| `output` | object | Container for result data |
| `output.id` | string | Prediction request_id |
| `output.urls.get` | string | URL to retrieve the prediction result |
| `output.error` | string | Error message if the prediction failed |
| `output.status` | string | Status of the prediction: `"completed"`, `"failed"`, etc. |
| `output.outputs` | array | **List of output video URLs** — this is where the generated video URL lives |
| `output.timings` | object | Timing information |
| `output.timings.inference` | number | Inference time in seconds |
| `output.created_at` | string | Timestamp when the prediction was created |
| `output.has_nsfw_contents` | array | List indicating NSFW content presence per output |

### How to extract the video URL:
The generated video URL is in `output.outputs[0]`. Poll until `output.status === "completed"`, then read `output.outputs[0]` for the video URL.

---

## Pricing

| Quality | Cost |
|---|---|
| basic | $0.08/sec ($0.60 for 5s video) |
| high | $0.15/sec ($0.75 for 5s video) |

Durations: 5, 10, or 15 seconds.

---

## Implementation Guide

1. **Upload Image(s)**: Provide 1–9 high-quality image URLs via the `images_list` field. The model preserves composition, lighting, and subject identity from your reference images.
2. **Write a Motion Prompt**: Describe the animation you want — camera movement, subject action, environmental effects. Reference specific images using `@image1`, `@image2`, etc.
3. **Choose Quality**: Select `basic` ($0.08/sec) for fast generation or `high` ($0.15/sec) for cinema-grade output.
4. **Set Duration**: Choose 5, 10, or 15 seconds.
5. **Pick Aspect Ratio**: Use 16:9 for widescreen, 9:16 for mobile/social, or 4:3/3:4 for other formats.
6. **Submit and Poll**: You'll receive a `request_id` immediately. Poll the result endpoint until status is `completed`.
