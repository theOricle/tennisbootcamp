import type { Program } from "@/types/program";

export const programs: Program[] = [
  {
    id: "bootcamps",
    title: "Bootcamps",
    description: "High-intensity group training for measurable improvement.",
    type: "Bootcamp",
    comingSoon: false,
    ctaText: "Book Now",
    ctaHref: "/programs",
    imageSrc: "/images/programs/bootcamps.png",
  },
  {
    id: "kids-summer-camp",
    title: "Kid's Summer Camp",
    description: "Fun, structured training for juniors with fundamentals and confidence.",
    type: "Summer Camp",
    comingSoon: true,
    ctaText: "Book Now",
    ctaHref: "/programs",
    imageSrc: "/images/programs/kids-summer-camp.png",
  },
  {
    id: "group-lessons",
    title: "Group lessons",
    description: "Adult group lessons with clear progressions and lots of reps.",
    type: "Group Lessons",
    comingSoon: true,
    ctaText: "Book Now",
    ctaHref: "/programs",
    imageSrc: "/images/programs/group-lessons.png",
  },
];
