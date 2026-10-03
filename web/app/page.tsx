import { LadderProvider } from "@/components/LadderProvider";
import { Nav } from "@/components/Nav";
import { SmoothScroll } from "@/components/SmoothScroll";
import { Hero } from "@/components/sections/Hero";
import { Rating } from "@/components/sections/Rating";
import { getHistory } from "@/lib/api";

export default async function Home() {
  const history = await getHistory();

  return (
    <SmoothScroll>
      <LadderProvider initialHistory={history}>
        <Nav />
        <main className="m-2 overflow-clip rounded-[28px] border border-bark/10 bg-cream md:m-3 md:rounded-[44px]">
          <Hero />
          <Rating />
        </main>
      </LadderProvider>
    </SmoothScroll>
  );
}
