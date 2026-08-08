import "./globals.css";

export const metadata = {
  title: "AI Interview Agent — ABTalks Cohort",
  description: "Adaptive voice-enabled technical interview agent for the ABTalks AI Cohort",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}