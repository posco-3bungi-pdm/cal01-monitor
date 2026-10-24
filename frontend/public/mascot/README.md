# Menu mascot

User-supplied Poseokho PNGs, copied without bitmap changes on 2026-10-24:

- `poseokho-greeting.png`: clipboard image 672f01c5-f2d3-41f8-8b4b-c03476fdf0f3 (greeting pose).
- `poseokho-cheer.png`: clipboard image 7475f5e3-cf26-4e8f-8ce4-28867bddfb68 (celebration pose).

Original aspect ratios are retained with object-fit. Slow breathing and weight shifts are anchored at the feet. These are whole-image transforms, not articulated character animation. The original celebration PNG is retained as an available asset.

Additional user-supplied PNGs copied unchanged on 2026-10-25:

- `poseokho-inspect.png`: e11704d1-6f8f-459f-8911-5a98a3208d92, click response (inspection lean).
- `poseokho-double-thumbs.png`: 12ab994c-15e4-4957-aff6-237c07bcf24d, idle expression.
- `poseokho-thumbs-up.png`: 138a90ac-5222-4167-911e-e58ac2f4be71, idle expression.
- `poseokho-fighting.png`: 63168c31-1324-4ccd-aa22-ab5e5c5e35d2, click response (small encouraging lift).
- `poseokho-celebrate.png`: 618df415-5f10-49ae-afd0-ea1f037dd4d7, click response (gentle celebratory bounce).
- `poseokho-coil-train.png`: 3d3d261b-a819-4378-8f78-a9f15d9af203, new-LOT notice only.

The current version randomly alternates the greeting and two thumbs-up poses every nine seconds. Clicking uses only inspect/fighting/celebrate poses and a spirit-themed message. It returns to an idle pose at the next automatic change. Images retain their aspect ratios; motion uses whole-image transforms. The train keeps its original ratio, with height six pixels below a zone button, and crosses the dock once per live LOT entry. Reduced motion shows a stationary notice.

Copy is encouragement, never a computed equipment status or assertion that operation is complete/safe. Automatic motion and message changes pause when the menu is closed, when paused by the user, or when reduced motion is enabled. Manual expression and message changes still work while paused, without starting motion.
