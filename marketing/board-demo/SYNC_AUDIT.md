# Sync audit (v3)

118 of 118 beats pass (onset within ±250 ms of the anchor word; on screen ≥2 s, montage tiles ≥1.5 s).

Onset is measured, not assumed: for board actions it is the first frame where the pixels inside the action area change (after two still frames) in the edited picture; for spotlights, the frame the overlay passes half opacity.

| Beat | Anchor word | Anchor (s) | Visual onset (s) | Offset (ms) | On screen (s) | Result | Measured by |
|---|---|---|---|---|---|---|---|
| h4 | follow | 13.23 | 13.13 | -96 | 5.5 | pass | frame diff (board, act area) |
| b11 | scanning | 19.79 | 19.70 | -86 | 3.0 | pass | frame diff (board, act area) |
| b12 | six | 24.23 | 24.23 | +6 | 4.4 | pass | spotlight alpha ≥ 0.5 |
| b13 | backup | 27.95 | 27.87 | -83 | 3.1 | pass | frame diff (board, act area) |
| b14 | pin | 30.51 | 30.43 | -74 | 2.9 | pass | frame diff (board, act area) |
| b15 | shuffle | 33.76 | 33.67 | -95 | 2.8 | pass | frame diff (board, act area) |
| b16 | class | 37.11 | 37.13 | +22 | 3.9 | pass | spotlight alpha ≥ 0.5 |
| b17 | videos | 41.46 | 41.47 | +7 | 4.6 | pass | spotlight alpha ≥ 0.5 |
| b18 | plan | 45.35 | 45.27 | -80 | 3.8 | pass | frame diff (board, act area) |
| b19 | books | 49.16 | 49.07 | -92 | 3.4 | pass | frame diff (board, act area) |
| b1a | saved | 52.22 | 52.27 | +45 | 4.9 | pass | frame diff (board, act area) |
| b21 | pen | 57.91 | 57.83 | -80 | 2.8 | pass | frame diff (board, act area) |
| b21 | colour | 58.50 | 58.43 | -70 | 2.8 | pass | frame diff (board, act area) |
| b21 | thickness | 58.93 | 58.83 | -100 | 2.8 | pass | frame diff (board, act area) |
| b22 | write | 60.56 | 60.47 | -96 | 2.1 | pass | frame diff (board, act area) |
| b23 | shapes | 62.98 | 62.90 | -77 | 3.0 | pass | frame diff (board, act area) |
| b24 | line | 66.51 | 66.43 | -79 | 4.6 | pass | frame diff (board, act area) |
| b24 | arrows | 67.76 | 67.67 | -96 | 4.6 | pass | frame diff (board, act area) |
| b25 | air | 70.88 | 70.90 | +23 | 2.7 | pass | frame diff (board, act area) |
| b25 | glass | 71.34 | 71.27 | -71 | 2.7 | pass | frame diff (board, act area) |
| b26 | highlighter | 72.64 | 72.70 | +63 | 2.5 | pass | frame diff (board, act area) |
| b27 | eraser | 76.43 | 76.37 | -68 | 2.7 | pass | frame diff (board, act area) |
| b28 | undo | 78.15 | 78.07 | -85 | 2.1 | pass | frame diff (board, act area) |
| b29 | lasso | 80.64 | 80.57 | -75 | 3.3 | pass | frame diff (board, act area) |
| b29 | move | 81.92 | 81.83 | -88 | 3.3 | pass | frame diff (board, act area) |
| b2a | ruler | 83.22 | 83.13 | -88 | 3.4 | pass | frame diff (board, act area) |
| b2a | protractor | 83.96 | 83.87 | -95 | 3.4 | pass | frame diff (board, act area) |
| b31 | neat | 89.75 | 89.67 | -83 | 4.5 | pass | frame diff (board, act area) |
| b32 | perfect | 93.84 | 93.77 | -72 | 3.2 | pass | frame diff (board, act area) |
| b33 | textbook | 96.27 | 96.20 | -74 | 2.1 | pass | frame diff (board, act area) |
| b34 | every | 98.01 | 97.93 | -76 | 2.8 | pass | frame diff (board, act area) |
| b35 | science | 101.64 | 101.57 | -71 | 4.9 | pass | frame diff (board, act area) |
| b35 | maths | 102.54 | 102.47 | -71 | 4.9 | pass | frame diff (board, act area) |
| b35 | computer | 103.70 | 103.60 | -97 | 4.9 | pass | frame diff (board, act area) |
| b41 | add | 107.14 | 107.07 | -77 | 2.1 | pass | frame diff (board, act area) |
| b42 | every | 109.25 | 109.17 | -79 | 3.1 | pass | frame diff (board, act area) |
| b43 | lines | 113.23 | 113.13 | -93 | 4.0 | pass | frame diff (board, act area) |
| b43 | grid | 113.83 | 113.73 | -93 | 4.0 | pass | frame diff (board, act area) |
| b43 | chalkboard | 114.55 | 114.47 | -80 | 4.0 | pass | frame diff (board, act area) |
| b44 | share | 115.85 | 115.77 | -80 | 4.1 | pass | frame diff (board, act area) |
| b44 | whatsapp | 117.65 | 117.67 | +20 | 4.1 | pass | spotlight alpha ≥ 0.5 |
| b44 | email | 118.53 | 118.53 | +7 | 4.1 | pass | spotlight alpha ≥ 0.5 |
| b51 | open | 121.67 | 121.60 | -70 | 3.6 | pass | frame diff (board, act area) |
| b51 | turn | 123.35 | 123.27 | -83 | 3.6 | pass | frame diff (board, act area) |
| b52 | lab | 125.28 | 125.20 | -81 | 2.7 | pass | frame diff (board, act area) |
| b52 | move | 126.12 | 126.17 | +46 | 2.7 | pass | frame diff (board, act area) |
| b53 | phet | 127.98 | 127.97 | -18 | 2.8 | pass | frame diff (tile on screen) |
| b53 | animations | 130.74 | 130.63 | -111 | 2.5 | pass | frame diff (tile on screen) |
| b53 | concept | 133.20 | 133.10 | -105 | 2.6 | pass | frame diff (tile on screen) |
| b53 | kit | 135.84 | 135.73 | -111 | 1.6 | pass | frame diff (tile on screen) |
| b54 | add | 138.77 | 138.70 | -70 | 5.5 | pass | frame diff (board, act area) |
| b54 | pdfs | 139.91 | 139.93 | +23 | 5.5 | pass | spotlight alpha ≥ 0.5 |
| b54 | slides | 141.11 | 141.13 | +23 | 5.5 | pass | spotlight alpha ≥ 0.5 |
| b54 | pictures | 141.51 | 141.53 | +23 | 5.5 | pass | spotlight alpha ≥ 0.5 |
| b54 | sticky | 141.93 | 141.93 | +3 | 5.5 | pass | spotlight alpha ≥ 0.5 |
| b55 | browser | 143.71 | 143.60 | -107 | 2.0 | pass | frame diff (tile on screen) |
| b55 | camera | 145.75 | 145.63 | -114 | 2.5 | pass | frame diff (tile on screen) |
| b61 | asks | 150.41 | 150.33 | -72 | 2.6 | pass | frame diff (board, act area) |
| b62 | shows | 155.38 | 155.40 | +20 | 5.2 | pass | spotlight alpha ≥ 0.5 |
| b63 | writes | 158.88 | 158.80 | -75 | 3.0 | pass | frame diff (board, act area) |
| b64 | goals | 161.30 | 161.33 | +33 | 3.6 | pass | spotlight alpha ≥ 0.5 |
| b64 | steps | 161.72 | 161.73 | +13 | 3.6 | pass | spotlight alpha ≥ 0.5 |
| b64 | activities | 162.34 | 162.37 | +26 | 3.6 | pass | spotlight alpha ≥ 0.5 |
| b64 | exit | 162.90 | 162.93 | +33 | 3.6 | pass | spotlight alpha ≥ 0.5 |
| b65 | quiz | 164.65 | 164.63 | -15 | 2.3 | pass | frame diff (tile on screen) |
| b65 | homework | 166.93 | 166.83 | -95 | 2.3 | pass | frame diff (tile on screen) |
| b65 | lecture | 169.27 | 169.27 | -2 | 1.6 | pass | frame diff (tile on screen) |
| b65 | read | 170.83 | 170.73 | -95 | 2.0 | pass | frame diff (tile on screen) |
| b71 | attendance | 175.07 | 175.00 | -71 | 3.6 | pass | frame diff (board, act area) |
| b72 | question | 180.04 | 179.97 | -77 | 3.2 | pass | frame diff (board, act area) |
| b73 | phones | 181.85 | 181.87 | +13 | 3.0 | pass | frame diff (board, act area) |
| b73 | live | 183.33 | 183.37 | +33 | 3.0 | pass | frame diff (board, act area) |
| b74 | cards | 185.88 | 185.90 | +18 | 3.2 | pass | spotlight alpha ≥ 0.5 |
| b75 | reveals | 188.34 | 188.27 | -75 | 2.7 | pass | frame diff (board, act area) |
| b76 | word | 191.29 | 191.20 | -91 | 3.9 | pass | frame diff (board, act area) |
| b76 | grow | 193.03 | 193.03 | +2 | 3.9 | pass | frame diff (board, act area) |
| b77 | random | 194.33 | 194.23 | -98 | 1.9 | pass | frame diff (tile on screen) |
| b77 | timer | 196.25 | 196.13 | -118 | 2.2 | pass | frame diff (tile on screen) |
| b77 | score | 198.47 | 198.37 | -105 | 1.8 | pass | frame diff (tile on screen) |
| b77 | badges | 200.25 | 200.13 | -118 | 1.6 | pass | frame diff (tile on screen) |
| b78 | groups | 203.18 | 203.07 | -111 | 1.8 | pass | frame diff (tile on screen) |
| b78 | split | 204.98 | 204.87 | -111 | 2.8 | pass | frame diff (tile on screen) |
| b81 | homework | 211.15 | 211.07 | -86 | 2.9 | pass | frame diff (board, act area) |
| b82 | sends | 212.53 | 212.43 | -95 | 2.0 | pass | frame diff (board, act area) |
| b83 | classmates | 214.98 | 214.88 | -100 | 5.6 | pass | overlay start |
| b83 | marks | 218.10 | 218.00 | -100 | 5.6 | pass | overlay start |
| b84 | tagged | 220.97 | 220.90 | -74 | 4.7 | pass | frame diff (board, act area) |
| b91 | record | 226.61 | 226.53 | -76 | 3.0 | pass | frame diff (board, act area) |
| b92 | markers | 230.45 | 230.37 | -88 | 3.5 | pass | frame diff (board, act area) |
| b92 | stars | 231.39 | 231.30 | -94 | 3.5 | pass | frame diff (board, act area) |
| b93 | recordings | 232.95 | 232.87 | -79 | 2.8 | pass | frame diff (board, act area) |
| b94 | captions | 236.83 | 236.73 | -93 | 3.1 | pass | frame diff (tile on screen) |
| b94 | cast | 239.95 | 239.83 | -113 | 2.8 | pass | frame diff (tile on screen) |
| b94 | second | 242.79 | 242.67 | -120 | 1.8 | pass | frame diff (tile on screen) |
| b94 | freeze | 244.55 | 244.43 | -113 | 2.1 | pass | frame diff (tile on screen) |
| b101 | warmer | 248.95 | 248.87 | -83 | 2.9 | pass | frame diff (board, act area) |
| b102 | dark | 252.40 | 252.33 | -67 | 2.5 | pass | frame diff (board, act area) |
| b103 | hindi | 254.09 | 254.00 | -90 | 2.6 | pass | frame diff (board, act area) |
| b103 | kannada | 255.02 | 255.03 | +13 | 2.6 | pass | frame diff (board, act area) |
| b104 | voice | 256.60 | 256.50 | -95 | 2.2 | pass | frame diff (tile on screen) |
| b104 | reader | 258.82 | 258.70 | -115 | 2.4 | pass | frame diff (tile on screen) |
| b104 | shade | 261.20 | 261.10 | -95 | 2.1 | pass | frame diff (tile on screen) |
| b104 | spotlight | 263.26 | 263.17 | -89 | 1.6 | pass | frame diff (tile on screen) |
| b105 | magnifier | 266.15 | 266.07 | -82 | 3.8 | pass | frame diff (board, act area) |
| b111 | simple | 270.83 | 270.73 | -94 | 3.1 | pass | frame diff (board, act area) |
| b112 | toolbar | 274.77 | 274.70 | -71 | 2.6 | pass | frame diff (board, act area) |
| b113 | touch | 276.07 | 275.97 | -105 | 2.3 | pass | frame diff (tile on screen) |
| b113 | diagnostics | 278.35 | 278.23 | -118 | 2.1 | pass | frame diff (tile on screen) |
| b121 | nothing | 282.91 | 282.83 | -79 | 4.4 | pass | frame diff (board, act area) |
| b121 | sync | 284.95 | 284.97 | +14 | 4.4 | pass | spotlight alpha ≥ 0.5 |
| b122 | ends | 287.14 | 287.07 | -69 | 2.1 | pass | frame diff (board, act area) |
| b123 | teacher | 292.78 | 292.68 | -100 | 7.3 | pass | overlay start |
| b123 | student | 293.56 | 293.46 | -100 | 7.3 | pass | overlay start |
| b123 | parent | 294.06 | 293.96 | -100 | 7.3 | pass | overlay start |
| r1 | ink | 296.77 | 296.67 | -104 | 2.7 | pass | tile appears |
| r1 | assistant | 299.45 | 299.33 | -117 | 2.2 | pass | tile appears |
| r1 | answers | 301.67 | 301.57 | -104 | 2.4 | pass | tile appears |
| r1 | sync | 304.07 | 303.97 | -104 | 1.6 | pass | tile appears |
