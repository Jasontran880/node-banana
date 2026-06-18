# Higgsfield Soul Standard — API Reference

## Server

```
https://platform.higgsfield.ai
```

## Authentication

All requests require the `Authorization` header with both your API key and secret:

```
Authorization: Key {your_api_key}:{your_api_key_secret}
```

| Header          | Format                              | Required | Description                          |
|-----------------|-------------------------------------|----------|--------------------------------------|
| `Authorization` | `Key {api_key}:{api_key_secret}`    | **Yes**  | Combined API key and secret          |

Get your credentials from [Higgsfield Cloud](https://cloud.higgsfield.ai/).

---

## Endpoints

### 1. Generate Image

```
POST /higgsfield-ai/soul/standard
```

Creates a new image generation request. Returns a `request_id` for polling status.

**Content-Type:** `application/json`

#### Request Body

| Field             | Type    | Required | Default | Description                                      |
|-------------------|---------|----------|---------|--------------------------------------------------|
| `prompt`          | string  | **Yes**  | —       | Text prompt describing the image to generate     |
| `aspect_ratio`    | enum    | No       | `"4:3"` | Aspect ratio of the output image                 |
| `batch_size`      | enum    | No       | `1`     | Number of images to generate per request          |
| `enhance_prompt`  | boolean | No       | `true`  | Whether to auto-enhance the prompt               |
| `resolution`      | enum    | No       | `"720p"`| Output resolution                                |
| `seed`            | integer | No       | `null`  | Reproducibility seed (min: 1, max: 1000000)      |
| `style_id`        | uuid    | No       | `null`  | Soul Style ID to apply (get from `/soul-styles`)  |
| `style_strength`  | float   | No       | `1`     | Strength of the applied style (min: 0, max: 1)   |

**`aspect_ratio` values:** `"9:16"` | `"16:9"` | `"4:3"` | `"3:4"` | `"1:1"` | `"2:3"` | `"3:2"`

**`batch_size` values:** `1` | `4`

**`resolution` values:** `"720p"` | `"1080p"`

#### Example Request

```bash
curl -X POST 'https://platform.higgsfield.ai/higgsfield-ai/soul/standard' \
  --header 'Authorization: Key {your_api_key}:{your_api_key_secret}' \
  --data '{
    "prompt": "A hyperrealistic portrait of a woman in golden hour light",
    "aspect_ratio": "16:9",
    "resolution": "720p"
  }'
```

#### Response `200` — Request

```json
{
  "status": "queued",
  "request_id": "123e4567-e89b-12d3-a456-426614174000",
  "status_url": "https://platform.higgsfield.ai/requests/123e4567-e89b-12d3-a456-426614174000/status",
  "cancel_url": "https://platform.higgsfield.ai/requests/123e4567-e89b-12d3-a456-426614174000/cancel"
}
```

| Field        | Type   | Description                          |
|--------------|--------|--------------------------------------|
| `request_id` | uuid   | Unique ID for this generation request |
| `status`     | enum   | Current status of the request        |
| `status_url` | uri    | URL to poll for status updates       |
| `cancel_url` | uri    | URL to cancel this request           |

---

### 2. Get Generation Status

```
GET /requests/{request_id}/status
```

Poll this endpoint to check whether your generation is complete.

#### Path Parameters

| Parameter    | Type | Required | Description                 |
|--------------|------|----------|-----------------------------|
| `request_id` | uuid | **Yes**  | The ID returned from generate |

#### Example Request

```bash
curl https://platform.higgsfield.ai/requests/YOUR_REQUEST_ID/status \
  --header 'Authorization: Key {your_api_key}:{your_api_key_secret}'
```

#### Response `200` — Request

While queued or in progress:

```json
{
  "status": "queued",
  "request_id": "123e4567-e89b-12d3-a456-426614174000",
  "status_url": "https://platform.higgsfield.ai/requests/123e4567-e89b-12d3-a456-426614174000/status",
  "cancel_url": "https://platform.higgsfield.ai/requests/123e4567-e89b-12d3-a456-426614174000/cancel"
}
```

When completed (includes `images` array and `video` object):

```json
{
  "status": "completed",
  "request_id": "d7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff",
  "status_url": "https://platform.higgsfield.ai/requests/d7e6c0f3-6699-4f6c-bb45-...",
  "cancel_url": "https://platform.higgsfield.ai/requests/d7e6c0f3-6699-4f6c-bb45-...",
  "images": [
    {
      "url": "https://image.url/example.jpg"
    }
  ],
  "video": {
    "url": "https://video.url/example.mp4"
  }
}
```

| Field          | Type     | Description                                                        |
|----------------|----------|--------------------------------------------------------------------|
| `request_id`   | uuid     | Unique ID for this generation request                              |
| `status`       | enum     | Current status (see values below)                                  |
| `status_url`   | uri      | URL to continue polling                                            |
| `cancel_url`   | uri      | URL to cancel this request                                         |
| `images`       | array    | **Present when `status` is `"completed"`.** Array of image objects. |
| `images[].url` | string   | Direct URL to the generated image                                  |
| `video`        | object   | **Present when `status` is `"completed"`.** Video object.          |
| `video.url`    | string   | Direct URL to the generated video                                  |

> **Note:** `images` length matches `batch_size` (1 or 4). Access images via `result.images[0].url`, video via `result.video.url`.

#### Status Values

| Value         | Description                                                      |
|---------------|------------------------------------------------------------------|
| `queued`      | Request is waiting in the queue and has not started processing    |
| `in_progress` | Generation is actively processing (cancellation not available)   |
| `nsfw`        | Content failed moderation checks (credits refunded)              |
| `failed`      | Generation encountered an error (credits refunded)               |
| `completed`   | Generation finished successfully (media available for download)  |

---

### 3. Cancel Generation

```
POST /requests/{request_id}/cancel
```

Cancels a pending generation. **You can only cancel a request while it remains in the `queued` status.** Once processing begins (`in_progress`), cancellation is no longer possible.

#### Path Parameters

| Parameter    | Type | Required | Description                 |
|--------------|------|----------|-----------------------------|
| `request_id` | uuid | **Yes**  | The ID returned from generate |

#### Example Request

```bash
curl -X POST https://platform.higgsfield.ai/requests/{request_id}/cancel \
  --header 'Authorization: Key {your_api_key}:{your_api_key_secret}'
```

#### Responses

| Status Code       | Description                                         |
|--------------------|-----------------------------------------------------|
| `202 Accepted`     | Request was successfully canceled                   |
| `400 Bad Request`  | Request is already processing or completed — cannot cancel |

---

### 4. Get Soul Styles

```
GET /v1/text2image/soul-styles
```

Returns all available Soul Style presets. Use the `id` from a style in the `style_id` field of the generate endpoint.

> **Implementation pattern for dropdown UI:** Call this endpoint once on app startup (or cache the result). Map the response array to populate a `<select>` / dropdown where the display label is `name` and the value is `id`. Pass the selected `id` as `style_id` in the generate request.

#### Example Request

```bash
curl https://platform.higgsfield.ai/v1/text2image/soul-styles \
  --header 'Authorization: Key {your_api_key}:{your_api_key_secret}'
```

#### Response `200` — Array of `SoulStyle[]`

```json
[
  {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "name": "Tokyo Streetstyle",
    "description": "Urban Japanese street fashion aesthetic",
    "preview_url": "https://example.com/preview.jpg"
  }
]
```

| Field         | Type   | Required  | Description                            |
|---------------|--------|-----------|----------------------------------------|
| `id`          | uuid   | Yes       | Style ID — pass to `style_id` in generate |
| `name`        | string | Yes       | Human-readable style name              |
| `preview_url` | uri    | Yes       | Preview image URL (read-only)          |
| `description` | string | Nullable  | Optional style description             |

#### Response `422` — Validation Error

Returned when request headers are missing or malformed.

#### Node.js Example — Fetching Styles for Dropdown

```javascript
async function getSoulStyles() {
  const res = await fetch(`${BASE}/v1/text2image/soul-styles`, {
    headers: { Authorization: AUTH_HEADER },
  });
  const styles = await res.json(); // Array of { id, name, description, preview_url }
  return styles;
}

// Populate a dropdown
const styles = await getSoulStyles();
// styles.forEach(s => addDropdownOption(s.name, s.id));
// Then pass the selected id as style_id in the generate request
```

---

## Soul Styles — Categorized Reference

There are ~97 styles available. For dropdown UIs, group them into categories using `<optgroup>` or equivalent.
A categorized mapping is provided in `soul-styles-categorized.json` alongside this reference.

**Recommended implementation pattern for Node Banana:**

1. On app startup, call `GET /v1/text2image/soul-styles` to fetch the latest styles
2. Fall back to the cached `soul-styles-categorized.json` if the API call fails
3. Render as a grouped dropdown (`<select>` with `<optgroup>` labels)
4. Include a "None" option at the top with `value=""` for no style
5. Pass the selected `id` as `style_id` in the generate request body

**Category groupings (for optgroup labels):**

| Category               | Example Styles                                           |
|------------------------|----------------------------------------------------------|
| General                | General, Realistic, iPhone, Movie, Artwork               |
| Camera & Lens Effects  | 360 cam, Fisheye, CCTV, DigitalCam, 0.5 Selfie          |
| Retro & Era            | Y2K, 2000s Fashion, 90s Grain, 90's Editorial, Medieval  |
| Fashion & Beauty       | FashionShow, Bimbocore, Coquette core, Gorpcore, Grunge  |
| Makeup & Close-ups     | Babydoll MakeUp, Bleached Brows, Grillz Selfie, RingSelfie |
| Locations & Scenes     | Tokyo Streetstyle, Amalfi Summer, Library, Subway, Gallery |
| Beach & Outdoors       | Sunset beach, Night Beach, Sunbathing, Sand              |
| Weather & Mood         | Foggy Morning, Rainy Day, Sunburnt                       |
| Poses & Actions        | Sitting on the Street, Crossing the street, Eating Food  |
| Digital & Glitch Art   | Glitch, PixeletedFace, Invertethereal                    |
| Artistic & Mixed Media | Avant-garde, Mixed Media, Paper Face, Graffiti           |
| Internet & Nostalgia   | Tumblr, Rhyme & blues                                    |
| Fantasy & Surreal      | Fairycore, Angel Wings, Creatures, Swords Hill           |
| Surreal Scale          | Giant People, Giant Accessory, Long legs, Duplicate      |
| Lighting & Contrast    | Spotlight, Through The Glass                             |

---

## Typical Workflow

```
1. (Optional) GET /v1/text2image/soul-styles   →  Browse available styles
2. POST /higgsfield-ai/soul/standard            →  Submit generation, get request_id
3. GET  /requests/{request_id}/status           →  Poll until status is "completed"
4. (Optional) POST /requests/{request_id}/cancel →  Cancel if needed
```

### Polling Pattern (Pseudocode)

```python
import time
import requests

API_KEY = "your-api-key"
API_SECRET = "your-api-secret"
BASE = "https://platform.higgsfield.ai"
HEADERS = {
    "Authorization": f"Key {API_KEY}:{API_SECRET}",
    "Content-Type": "application/json",
}

# 1. Submit generation
resp = requests.post(f"{BASE}/higgsfield-ai/soul/standard", headers=HEADERS, json={
    "prompt": "A cinematic portrait in warm golden light",
    "aspect_ratio": "3:4",
    "resolution": "1080p",
})
data = resp.json()
request_id = data["request_id"]

# 2. Poll for completion
while True:
    status_resp = requests.get(f"{BASE}/requests/{request_id}/status", headers=HEADERS)
    status_data = status_resp.json()
    status = status_data["status"]

    if status == "completed":
        images = status_data["images"]
        for i, img in enumerate(images):
            print(f"Image {i}: {img['url']}")
        if "video" in status_data:
            print(f"Video: {status_data['video']['url']}")
        break
    elif status in ("failed", "nsfw"):
        print(f"Request ended with status: {status}")
        break
    else:
        print(f"Status: {status} — waiting...")
        time.sleep(2)
```

### Node.js Example

```javascript
const API_KEY = "your-api-key";
const API_SECRET = "your-api-secret";
const BASE = "https://platform.higgsfield.ai";
const AUTH_HEADER = `Key ${API_KEY}:${API_SECRET}`;

async function generateImage(prompt, options = {}) {
  const res = await fetch(`${BASE}/higgsfield-ai/soul/standard`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: AUTH_HEADER,
    },
    body: JSON.stringify({
      prompt,
      aspect_ratio: options.aspect_ratio ?? "4:3",
      batch_size: options.batch_size ?? 1,
      resolution: options.resolution ?? "720p",
      enhance_prompt: options.enhance_prompt ?? true,
      seed: options.seed ?? null,
      style_id: options.style_id ?? null,
      style_strength: options.style_strength ?? 1,
    }),
  });
  return res.json();
}

async function pollStatus(requestId, intervalMs = 2000) {
  while (true) {
    const res = await fetch(`${BASE}/requests/${requestId}/status`, {
      headers: { Authorization: AUTH_HEADER },
    });
    const data = await res.json();

    if (data.status === "completed") return data; // data.images[].url, data.video.url
    if (["failed", "nsfw"].includes(data.status)) {
      throw new Error(`Generation ended with status: ${data.status}`);
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// Usage
const { request_id } = await generateImage("A woman in a sunlit cafe");
const result = await pollStatus(request_id);
console.log(result.images.map((img) => img.url));
```

---

## Official Python SDK

Higgsfield provides an official Python SDK: [`higgsfield-client`](https://github.com/higgsfield-ai/higgsfield-client)

```bash
pip install higgsfield-client
```

### Authentication (SDK)

```bash
# Option 1: Combined key
export HF_KEY="your-api-key:your-api-secret"

# Option 2: Separate
export HF_API_KEY="your-api-key"
export HF_API_SECRET="your-api-secret"
```

### Quick Usage (SDK)

```python
import higgsfield_client

# One-liner: submit + wait + return result
result = higgsfield_client.subscribe(
    'higgsfield-ai/soul/standard',
    arguments={
        'prompt': 'A hyperrealistic portrait in golden hour light',
        'resolution': '720p',
        'aspect_ratio': '3:4',
    }
)

print(result['images'][0]['url'])
```

### Webhook Support

The SDK and API support an optional `webhook_url` parameter on submit. When provided, Higgsfield will POST to your URL upon completion instead of requiring polling.

```python
request_controller = higgsfield_client.submit(
    'higgsfield-ai/soul/standard',
    arguments={'prompt': 'A cinematic portrait'},
    webhook_url='https://your-server.com/webhook'
)
```

### File Uploads (SDK)

For image-to-image workflows, upload reference images first:

```python
import higgsfield_client

# Upload from file path
url = higgsfield_client.upload_file('reference.jpeg')

# Upload from PIL Image
from PIL import Image
img = Image.open('reference.jpeg')
url = higgsfield_client.upload_image(img, format='jpeg')

# Use the returned URL in your request arguments
```
