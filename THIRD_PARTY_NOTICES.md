# Third-party notices

## MuscleMap

The body artwork behind the muscle map (`lib/muscles/body-paths.ts`) is
converted from [MuscleMap](https://github.com/melihcolpan/MuscleMap) by Melih
Colpan, at commit `5f576a5d3d697c3720abfada8e618d1cef08ea32`.

MuscleMap ships its SVG path data as Swift source.
`scripts/generate-body-paths.mjs` reads the four figure views (male and
female, front and back) from `Sources/MuscleMap/Data/*Paths.swift` and their
view boxes from `BodyPathData.swift`, and writes them out keyed by this app's
muscle names. Along the way it:

- merges each muscle's left and right paths,
- drops the sub-groups MuscleMap cuts from a parent muscle (upper and lower
  chest, inner and outer quad, upper and lower abs, front and rear deltoid,
  upper and lower trapezius, serratus), since the parent's artwork covers them,
- renames regions to this app's muscles — for example its upper back to lats,
  its rhomboids and rotator cuff to middle back, and its hip-flexor patch to
  abductors,
- squeezes whitespace out of the path data. The coordinates are unchanged.

Licensed under the MIT License:

```
MIT License

Copyright (c) 2026 Melih Colpan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
