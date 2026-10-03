import { LadderProvider } from "@/components/LadderProvider";
import { Nav } from "@/components/Nav";
import { SmoothScroll } from "@/components/SmoothScroll";
import { Footer } from "@/components/sections/Footer";
import { Hero } from "@/components/sections/Hero";
import { HowItWorks, Marquee } from "@/components/sections/HowItWorks";
import { Lab } from "@/components/sections/Lab";
import { Rating } from "@/components/sections/Rating";
import { Roles } from "@/components/sections/Roles";
import { getHistory } from "@/lib/api";

export default async function Home() {
  const history = await getHistory();

  return (
    <SmoothScroll>
      <LadderProvider initialHistory={history}>
        <Nav />
        <main className="m-2 overflow-clip rounded-[28px] border border-bark/10 bg-cream md:m-3 md:rounded-[44px]">
          <Hero />
          <Marquee />
          <HowItWorks />
          <Rating />
          <Roles />
          <Lab />
          <Footer />
        </main>
      </LadderProvider>
    </SmoothScroll>
  );
}
