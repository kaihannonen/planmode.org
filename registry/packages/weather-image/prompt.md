Create a {{style}} image that shows the current weather in {{location}}.

## Scene requirements

- Depict the city skyline or a recognizable landmark of {{location}} as the background
- Show the current weather conditions accurately: clouds, rain, snow, sunshine, fog, or any combination
- Include subtle atmospheric details: light direction matching the time of day, reflections on wet surfaces if raining, steam rising from streets in humid conditions
- Add human elements for scale: people with umbrellas, cyclists, street vendors -- appropriate to the weather and culture of {{location}}

## Style guide

{{#if (eq style "realistic")}}
- Photorealistic quality, as if captured by a professional street photographer
- Natural lighting with accurate shadows
- High dynamic range, rich detail in both highlights and shadows
- Shallow depth of field with the weather as the focal point
{{/if}}
{{#if (eq style "watercolor")}}
- Soft, flowing watercolor technique with visible paper texture
- Colors should bleed naturally at the edges
- Wet-on-wet technique for sky and clouds
- More defined brushstrokes for architectural elements
- Muted, atmospheric palette that emphasizes the mood of the weather
{{/if}}
{{#if (eq style "pixel-art")}}
- 16-bit pixel art style with a limited color palette (32 colors max)
- Clean, crisp pixels with no anti-aliasing
- Animated rain, snow, or sun rays if applicable (describe the animation frames)
- Retro video game aesthetic reminiscent of classic city-builder games
{{/if}}
{{#if (eq style "sketch")}}
- Hand-drawn pencil sketch with crosshatching for shadows
- Loose, expressive line work -- not perfectly clean
- Occasional ink wash for darker areas (clouds, shadows)
- White space used intentionally to convey bright or overcast light
- Architectural details rendered with more precision than natural elements
{{/if}}

## Composition

- Landscape orientation (16:9 aspect ratio)
- Weather should dominate the upper two-thirds of the image
- Street-level activity in the lower third
- Leading lines drawing the eye from foreground to the sky

## Mood

The image should evoke what it *feels like* to be in {{location}} right now -- not just what it looks like. Capture the temperature, the humidity, the energy of the city in that weather.
