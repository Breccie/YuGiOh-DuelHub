"use client";

import Image from "next/image";

function Artwork({ imageUrl, alt }: { imageUrl: string; alt: string }) {
  return <Image src={imageUrl} alt={alt} fill sizes="320px" className="object-cover" unoptimized />;
}

export function BinderDesignPreview({
  imageUrl,
  alt,
  custom,
  className = "",
}: {
  imageUrl: string;
  alt: string;
  custom: boolean;
  className?: string;
}) {
  if (!custom) {
    return (
      <div className={`relative aspect-[2/3] ${className}`}>
        <Image src={imageUrl} alt={alt} fill sizes="320px" className="object-contain" unoptimized />
      </div>
    );
  }

  return (
    <div className={`relative aspect-[2/3] ${className}`} data-custom-binder-preview>
      <div
        className="absolute overflow-hidden bg-[#11151b]"
        style={{ inset: "10.8% 10.2% 9.1% 22.4%", clipPath: "polygon(1.5% 0, 99% 0.8%, 100% 99%, 0 100%)" }}
      >
        <Artwork imageUrl={imageUrl} alt={alt} />
      </div>
      <Image
        src="/app-assets/custom-shells/binder-custom-shell.webp"
        alt=""
        fill
        sizes="320px"
        aria-hidden="true"
        className="pointer-events-none object-contain drop-shadow-[0_18px_26px_rgba(0,0,0,0.38)]"
      />
    </div>
  );
}

export function DeckBoxDesignPreview({
  imageUrl,
  alt,
  custom,
  className = "",
}: {
  imageUrl: string;
  alt: string;
  custom: boolean;
  className?: string;
}) {
  if (!custom) {
    return (
      <div className={`relative aspect-[2/3] ${className}`}>
        <Image src={imageUrl} alt={alt} fill sizes="320px" className="object-contain" unoptimized />
      </div>
    );
  }

  return (
    <div className={`relative aspect-[2/3] ${className}`} data-custom-deckbox-preview>
      <div
        className="absolute overflow-hidden bg-[#11151b]"
        style={{ inset: "27.2% 23.3% 14.3% 14.2%", clipPath: "polygon(1.5% 0, 98.5% 1.2%, 100% 100%, 0 98.5%)" }}
      >
        <Artwork imageUrl={imageUrl} alt={alt} />
      </div>
      <div
        className="absolute overflow-hidden bg-[#11151b]"
        style={{ inset: "12.2% 22% 81% 18.5%", clipPath: "polygon(5% 0, 96% 8%, 100% 94%, 0 100%)" }}
        aria-hidden="true"
      >
        <Image src={imageUrl} alt="" fill sizes="220px" className="object-cover" unoptimized />
      </div>
      <Image
        src="/app-assets/custom-shells/deckbox-custom-shell.webp"
        alt=""
        fill
        sizes="320px"
        aria-hidden="true"
        className="pointer-events-none object-contain drop-shadow-[0_18px_26px_rgba(0,0,0,0.38)]"
      />
    </div>
  );
}
