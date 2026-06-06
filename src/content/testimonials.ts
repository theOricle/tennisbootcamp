export type Testimonial = {
  name: string;
  role: string;
  quote: string;
  stat?: string;
  placeholder: true;
};

export const testimonials: Testimonial[] = [
  {
    name: "Daniel K.",
    role: "U18 OTA-ranked junior",
    quote: "Took my second serve from a liability to a weapon. I finally trust it under pressure.",
    stat: "+18 mph on 2nd serve",
    placeholder: true,
  },
  {
    name: "Sarah M.",
    role: "Adult recreational player",
    quote: "I'd been stuck at the same level for two years. Six weeks here moved me further than two seasons of group lessons.",
    placeholder: true,
  },
  {
    name: "Marcus P.",
    role: "Father of 9-year-old camper",
    quote: "He came home tired, happy, and suddenly talking about strategy. Worth every dollar.",
    placeholder: true,
  },
];
