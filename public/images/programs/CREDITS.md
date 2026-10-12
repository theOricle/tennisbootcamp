# Program photo credits

Free-licence stock photographs (owner, 2026-10-12): real people playing, in
place of the code-drawn Court Plates on the program cards and page heroes,
until Sina's own consented session photos replace them. Every photo is on
the [Unsplash License](https://unsplash.com/license) (free to use, no
permission needed, attribution appreciated); none is an Unsplash+ or
premium result. No logos, venue signage or identifiable brands; nobody in
them is a Tennis Bootcamp student or coach, and the site never says they
are.

Each file is a 16:10 crop of the photographer's original, resized to
1600 × 1000 and saved as WebP under 250 KB (sharp). `npm test`
(`test-program-groups.ts`) checks the size, the width and that each file is
listed here.

| File | Photographer | Photo | Shown on |
|---|---|---|---|
| `youth-bootcamps.webp` | Laura Marks | https://unsplash.com/photos/a-young-girl-playing-tennis-on-a-tennis-court-mfFVeuItimI | Youth Bootcamps card and page |
| `adult-bootcamps.webp` | Jim Weatherford | https://unsplash.com/photos/a-female-tennis-player-in-action-on-the-court-lqU8diyO3WU | Adult Bootcamps card and page |
| `private-lessons.webp` | Richard Sagredo | https://unsplash.com/photos/a-man-and-a-woman-playing-tennis-on-a-tennis-court-oDlLU_1hZwM | Private Lessons card and page |

To replace one: pick a free-licence photo of people playing that matches the
program's audience, crop it to 16:10, run it through sharp to at most 1600 px
wide and 250 KB, overwrite the file, update this table and the `alt` in
`src/content/programs.ts`.
