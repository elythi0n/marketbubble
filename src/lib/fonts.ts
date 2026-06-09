import localFont from "next/font/local";

/** Brand display face for wordmarks (nav, schedule headings, preloader, etc.). */
export const walburn = localFont({
  src: "../../public/fonts/walburn-regular.woff2",
  variable: "--font-walburn",
  display: "swap",
  weight: "400",
});
