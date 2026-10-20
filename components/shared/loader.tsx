import { LogoLoader } from "@/components/shared/logo-mark";

const CustomLoader = () => (
  <div className="flex h-screen w-full items-center justify-center bg-background">
    <LogoLoader label="Loading workspace" />
  </div>
);

export default CustomLoader;
