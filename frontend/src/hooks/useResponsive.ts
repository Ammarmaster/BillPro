import { useWindowDimensions, Platform } from "react-native";

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isWeb = Platform.OS === "web";
  const isMobile = !isWeb || width < 768;
  const isTablet = isWeb && width >= 768 && width < 1024;
  const isDesktop = isWeb && width >= 768;
  const isLargeDesktop = isWeb && width >= 1280;

  return {
    width,
    height,
    isWeb,
    isMobile,
    isTablet,
    isDesktop,
    isLargeDesktop,
  };
}
