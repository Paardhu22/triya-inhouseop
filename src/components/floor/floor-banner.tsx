import Link from "next/link";

export function FloorBanner({
  floorNumber,
}: {
  floorNumber: number;
  totalFloors: number;
  currentFloorIndex: number;
}) {
  const activeFloorNumStr = floorNumber < 0
    ? `B${Math.abs(floorNumber)}`
    : String(floorNumber).padStart(2, "0");

  return (
    <div className="fixed bottom-0 left-0 right-0 md:left-64 h-56 sm:h-[260px] md:h-[300px] lg:h-[350px] bg-background flex items-end justify-between px-6 sm:px-8 lg:px-12 pb-0 z-20 select-none overflow-hidden">
      {/* Left side: Back Button */}
      <div className="pb-6 sm:pb-8 lg:pb-10 z-20">
        <Link 
          href="/dashboard" 
          className="text-xs font-mono uppercase tracking-widest text-[#2c3040] hover:opacity-70 transition-opacity"
        >
          — Back
        </Link>
      </div>

      {/* Center: Giant Semicircle Dial */}
      <div className="absolute inset-x-0 bottom-[-20px] sm:bottom-[-40px] md:bottom-[-60px] lg:bottom-[-80px] flex justify-center items-end h-full pointer-events-none z-0">
        <div className="relative w-[360px] h-[180px] sm:w-[540px] sm:h-[270px] md:w-[720px] md:h-[360px] lg:w-[860px] lg:h-[430px] bg-[#2563eb] rounded-t-full border-[14px] sm:border-[20px] md:border-[28px] lg:border-[36px] border-[#2c3040] overflow-visible">
          {/* Plain semicircle */}
        </div>
      </div>

      {/* Right side: Giant Outlined Floor Number */}
      <div 
        className="absolute right-6 sm:right-8 lg:right-12 bottom-0 text-[10rem] sm:text-[14rem] md:text-[20rem] lg:text-[24rem] font-bold leading-none tracking-tighter text-transparent select-none z-10 pointer-events-none"
        style={{ WebkitTextStroke: "2.5px #2c3040" }}
      >
        {activeFloorNumStr}
      </div>
    </div>
  );
}
