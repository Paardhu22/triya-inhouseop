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
    <div className="relative w-auto -mx-6 sm:-mx-8 lg:-mx-12 -mb-10 lg:-mb-14 h-56 sm:h-[300px] md:h-[350px] lg:h-[400px] flex items-end justify-between px-6 sm:px-8 lg:px-12 pb-0 mt-16 border-b border-[#2c3040] select-none overflow-hidden">
      {/* Left side: Back Button */}
      <div className="pb-6 sm:pb-8 lg:pb-10 z-20">
        <Link 
          href="/dashboard" 
          className="text-xs font-mono uppercase tracking-widest text-[#2c3040] hover:opacity-70 transition-opacity"
        >
          — Back
        </Link>
      </div>

      {/* Center: Giant Semicircle Dial (Bigger diameter and shifted lower) */}
      <div className="absolute inset-x-0 bottom-[-20px] sm:bottom-[-40px] md:bottom-[-60px] lg:bottom-[-80px] flex justify-center items-end h-full pointer-events-none z-0">
        <div className="relative w-[360px] h-[180px] sm:w-[540px] sm:h-[270px] md:w-[720px] md:h-[360px] lg:w-[860px] lg:h-[430px] bg-[#2563eb] rounded-t-full border-[14px] sm:border-[20px] md:border-[28px] lg:border-[36px] border-[#2c3040] overflow-visible">
          {/* Plain semicircle - no tiny circle indicator */}
        </div>
      </div>

      {/* Right side: Giant Outlined Floor Number (Shifted further right) */}
      <div 
        className="absolute right-2 sm:right-4 lg:right-6 bottom-0 text-[10rem] sm:text-[14rem] md:text-[20rem] lg:text-[24rem] font-bold leading-none tracking-tighter text-transparent select-none z-10 pointer-events-none"
        style={{ WebkitTextStroke: "2.5px #2c3040" }}
      >
        {activeFloorNumStr}
      </div>
    </div>
  );
}
