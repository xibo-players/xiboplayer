# PWA Transition Implementation

This document describes the transition effects implementation for the PWA Core player.

## Overview

The PWA Core player now supports layout transition effects to match the Electron player's visual behavior. Transitions are applied when media items start (transition in) and stop (transition out).

## Supported Transition Types

### Fade Transitions
- **fadeIn**: Fade element from transparent to opaque
- **fadeOut**: Fade element from opaque to transparent

### Fly Transitions
- **flyIn**: Slide element in from specified direction
- **flyOut**: Slide element out in specified direction

### Compass Directions
Fly transitions support 8 compass directions:
- `N` (North) - from/to top
- `NE` (Northeast) - from/to top-right
- `E` (East) - from/to right
- `SE` (Southeast) - from/to bottom-right
- `S` (South) - from/to bottom
- `SW` (Southwest) - from/to bottom-left
- `W` (West) - from/to left
- `NW` (Northwest) - from/to top-left

## XLF Configuration

Transitions are configured in the XLF file within the `<options>` element of each media item:

```xml
<media type="image" id="123" duration="10">
  <options>
    <uri>image.jpg</uri>
    <transIn>fadeIn</transIn>
    <transInDuration>1000</transInDuration>
    <transOut>flyOut</transOut>
    <transOutDuration>500</transOutDuration>
    <transOutDirection>S</transOutDirection>
  </options>
</media>
```

### Transition Options
- `transIn`: Type of entrance transition (fadeIn, flyIn)
- `transInDuration`: Duration in milliseconds (default: 1000)
- `transInDirection`: Compass direction for flyIn (default: N)
- `transOut`: Type of exit transition (fadeOut, flyOut)
- `transOutDuration`: Duration in milliseconds (default: 1000)
- `transOutDirection`: Compass direction for flyOut (default: N)

## Implementation Details

### Architecture
1. **Transition Parsing**: XLF media options are parsed during layout translation
2. **Transition Storage**: Transition config is stored with each media object
3. **Transition Application**: Web Animations API applies transitions at runtime

### Web Animations API
Transitions use the browser-native [Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API):
- Hardware-accelerated
- Smooth 60fps animations
- Promise-based completion tracking
- No external dependencies

### Supported Media Types
All media types support transitions:
- Images
- Videos
- Text widgets
- Ticker widgets
- PDFs
- Webpages
- Clock, calendar, weather, and other widgets

## Testing

### Manual Testing Steps

1. **Create a test layout** in Xibo CMS with multiple regions and media items
2. **Configure transitions** for each media item:
   - Set transition in/out types
   - Configure durations (recommend 500-2000ms for visibility)
   - Test different compass directions for fly transitions
3. **Deploy to PWA player** and verify:
   - Media items smoothly fade/fly in when starting
   - Media items smoothly fade/fly out when stopping
   - Transitions respect configured durations
   - Fly directions work correctly
   - No visual glitches or stuttering

### Test Cases

#### Basic Fade Test
- Media with `transIn: fadeIn, duration: 1000`
- Expected: Media fades in over 1 second

#### Fly Direction Test
- Create 8 media items, one for each compass direction
- Configure each with `flyIn` using different directions
- Expected: Each flies in from its designated direction

#### Mixed Transitions Test
- Media 1: `fadeIn` → `flyOut` (direction: S)
- Media 2: `flyIn` (direction: N) → `fadeOut`
- Expected: Smooth transition from one media to next

#### Edge Cases
- No transition config → instant show/hide
- Invalid transition type → instant show/hide
- Zero duration → instant transition
- Multiple media in single region → sequential transitions

## Browser Compatibility

Web Animations API is supported in:
- Chrome/Edge 84+
- Firefox 75+
- Safari 13.1+

Fallback: If Web Animations API is unavailable, media appears/disappears instantly (no transitions).

## Performance Considerations

- Transitions use CSS transforms and opacity (GPU-accelerated)
- No JavaScript animation loops (no CPU overhead)
- Minimal memory footprint
- No impact on non-transitioning media

## Differences from Electron Player

The PWA implementation closely matches the Electron player but has minor differences:

1. **API Used**: PWA uses Web Animations API directly, Electron uses xibo-layout-renderer package
2. **Timing**: Both use same timing model (duration in milliseconds)
3. **Visual Result**: Identical appearance and smoothness
4. **Performance**: Both hardware-accelerated, comparable performance

## Future Enhancements

Possible future improvements:
- Additional transition types (slide, zoom, rotate)
- Easing function customization
- Transition between layouts (not just media)
- Synchronized transitions across multiple regions

## Troubleshooting

### Transitions Not Working
1. Check browser console for errors
2. Verify XLF has correct transition options
3. Confirm Web Animations API support (`'animate' in document.createElement('div')`)
4. Check that transition duration > 0

### Choppy Animations
1. Verify GPU acceleration is enabled
2. Check CPU usage (other processes may be interfering)
3. Reduce transition duration if device is slow
4. Test with simpler layouts (fewer simultaneous transitions)

### Transition Cuts Off Early
1. Check media duration vs transition duration
2. Ensure stop function waits for transition to complete
3. Verify no JavaScript errors interrupting animation

## Code References

- **Implementation**: `packages/core/src/layout.js`
- **Transition Functions**: Lines 6-133 (Transitions object)
- **Parsing**: Lines 210-236 (translateMedia method)
- **Application**: Inline in generated HTML (various media start functions)

## Related Documentation

- [Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API)
- [Xibo Layout XLF Format](https://xibo.org.uk/docs/developer/xlf-format)
- [Electron Player Transitions](platforms/electron/node_modules/@xibosignage/xibo-layout-renderer/dist/src/Modules/Transitions/Transitions.d.ts)
