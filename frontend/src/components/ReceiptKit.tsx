import React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  TextStyle,
  View,
  ViewStyle,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

// Shared look of the "one long receipt" theme: yellow page, paper column, printer ink
export const receipt = {
  page: "#FFE14D",
  pageInk: "#4A3B00",
  paper: "#FFFDF6",
  ink: "#1F1F1F",
  muted: "#66625A",
  rule: "#A8A396",
  tint: "#F4F0E2",
  accent: "#C93A08",
  accentFill: "#FF5E2B",
  danger: "#B42318",
  success: "#0F6E56",
  whatsapp: "#128C7E",
};

export const receiptFonts = {
  mono: Platform.select({
    web: "'Space Mono', 'JetBrains Mono', monospace",
    ios: "Menlo",
    default: "monospace",
  }) as string,
  display: Platform.select({
    web: "'Bricolage Grotesque', 'Plus Jakarta Sans', sans-serif",
    default: undefined,
  }) as string | undefined,
};

// The site builds with web output "single", which skips app/+html.tsx, so the fonts load from here
const RECEIPT_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@500;700;800&family=Space+Mono:wght@400;700&display=swap";

if (Platform.OS === "web" && typeof document !== "undefined" && !document.getElementById("receipt-fonts")) {
  const link = document.createElement("link");
  link.id = "receipt-fonts";
  link.rel = "stylesheet";
  link.href = RECEIPT_FONTS_URL;
  document.head.appendChild(link);
}

export function Mono({ style, ...props }: TextProps) {
  return <Text {...props} style={[kit.mono, style]} />;
}

export function Display({ style, ...props }: TextProps) {
  return <Text {...props} style={[kit.display, style]} />;
}

const TOOTH_WIDTH = 14;
const TOOTH_SIDE = TOOTH_WIDTH / Math.SQRT2;

// The torn edge of the paper, built from rotated squares so it also works in the phone app
export function PaperEdge({
  direction = "down",
  color = receipt.paper,
  style,
}: {
  direction?: "down" | "up";
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { width } = useWindowDimensions();
  const count = Math.ceil(width / TOOTH_WIDTH) + 1;
  const top = direction === "down" ? -TOOTH_SIDE / 2 : TOOTH_WIDTH / 2 - TOOTH_SIDE / 2;

  return (
    <View style={[kit.edge, style]} pointerEvents="none">
      {Array.from({ length: count }, (_, index) => (
        <View
          key={index}
          style={[
            kit.tooth,
            {
              backgroundColor: color,
              top,
              left: index * TOOTH_WIDTH + (TOOTH_WIDTH - TOOTH_SIDE) / 2,
            },
          ]}
        />
      ))}
    </View>
  );
}

// Single-sided dashed borders draw solid on Android, so the dashes come from a clipped full border
export function ReceiptRule({ color = receipt.rule, style }: { color?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[kit.ruleClip, style]}>
      <View style={[kit.ruleLine, { borderColor: color }]} />
    </View>
  );
}

export function ReceiptRow({
  label,
  value,
  bold,
  valueColor,
  style,
  textStyle,
}: {
  label: string;
  value: string;
  bold?: boolean;
  valueColor?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View style={[kit.row, style]}>
      <Mono style={[kit.rowText, kit.rowLabel, bold && kit.bold, textStyle]}>{label}</Mono>
      <Mono style={[kit.rowText, kit.rowValue, bold && kit.bold, valueColor ? { color: valueColor } : null, textStyle]}>
        {value}
      </Mono>
    </View>
  );
}

const BARCODE_BARS = [2, 1, 3, 1, 2, 4, 1, 2, 1, 3, 1, 2, 4, 1, 2, 1, 3, 2, 1, 4, 1, 2, 3, 1, 2, 1, 4, 2, 1, 3, 1, 2];

export function ReceiptBarcode({ height = 44, color = receipt.ink }: { height?: number; color?: string }) {
  return (
    <View style={[kit.barcode, { height }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {BARCODE_BARS.map((bar, index) => (
        <View key={index} style={{ flex: bar, backgroundColor: index % 2 === 0 ? color : "transparent" }} />
      ))}
    </View>
  );
}

export function ReceiptButton({
  label,
  icon,
  iconColor,
  variant = "ink",
  onPress,
  disabled,
  busy,
  style,
  testID,
}: {
  label: string;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  iconColor?: string;
  variant?: "ink" | "outline" | "accent" | "page";
  onPress?: () => void;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const textColor = variant === "outline" || variant === "page" ? receipt.ink : receipt.paper;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        kit.button,
        variant === "ink" && kit.buttonInk,
        variant === "outline" && kit.buttonOutline,
        variant === "accent" && kit.buttonAccent,
        variant === "page" && kit.buttonPage,
        disabled && kit.buttonDisabled,
        pressed && kit.buttonPressed,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={16} color={iconColor || textColor} /> : null}
          <Mono style={[kit.buttonText, { color: textColor }]}>{label}</Mono>
        </>
      )}
    </Pressable>
  );
}

export function ReceiptSectionTitle({
  label,
  title,
  subtitle,
  compact,
}: {
  label: string;
  title: string;
  subtitle?: string;
  compact?: boolean;
}) {
  return (
    <View style={kit.sectionTitle}>
      <Mono style={kit.sectionLabel}>{label}</Mono>
      <Display accessibilityRole="header" style={[kit.sectionHeading, compact && kit.sectionHeadingCompact]}>
        {title}
      </Display>
      {subtitle ? <Mono style={kit.sectionSubtitle}>{subtitle}</Mono> : null}
    </View>
  );
}

export function ReceiptField({
  label,
  icon,
  right,
  style,
  ...inputProps
}: TextInputProps & {
  label: string;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  right?: React.ReactNode;
}) {
  return (
    <View style={kit.field}>
      <Mono style={kit.fieldLabel}>{label}</Mono>
      <View style={kit.fieldBox}>
        {icon ? <Ionicons name={icon} size={18} color={receipt.muted} style={kit.fieldIcon} /> : null}
        <TextInput placeholderTextColor={receipt.muted} {...inputProps} style={[kit.fieldInput, style]} />
        {right}
      </View>
    </View>
  );
}

export function ReceiptNotice({
  tone = "error",
  text,
  testID,
}: {
  tone?: "error" | "success";
  text: string;
  testID?: string;
}) {
  const color = tone === "error" ? receipt.danger : receipt.success;
  return (
    <View style={[kit.notice, { borderColor: color }]}>
      <Ionicons name={tone === "error" ? "alert-circle-outline" : "checkmark-circle-outline"} size={18} color={color} />
      <Mono testID={testID} style={[kit.noticeText, { color }]}>
        {text}
      </Mono>
    </View>
  );
}

export function ReceiptTopBar({
  label,
  onBack,
  right,
}: {
  label?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[kit.topBar, { paddingTop: insets.top }]}>
      <View style={kit.topBarInner}>
        <View style={kit.topBarLeft}>
          {onBack ? (
            <Pressable onPress={onBack} style={kit.topBarBack} accessibilityRole="button" accessibilityLabel="Go back">
              <Ionicons name="arrow-back" size={22} color={receipt.ink} />
            </Pressable>
          ) : null}
          <Mono style={kit.topBarBrand}>EZBILL_</Mono>
          {label ? (
            <Mono style={kit.topBarLabel} numberOfLines={1}>
              {label}
            </Mono>
          ) : null}
        </View>
        {right}
      </View>
    </View>
  );
}

// Page frame of the account screens: yellow page, one short receipt, works with the phone keyboard
export function ReceiptFormShell({
  subtitle,
  title,
  description,
  onBack,
  maxWidth = 460,
  scrollRef,
  children,
}: {
  subtitle: string;
  title?: string;
  description?: string;
  onBack?: () => void;
  maxWidth?: number;
  scrollRef?: React.RefObject<ScrollView | null>;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={kit.formPage}>
      <StatusBar barStyle="dark-content" backgroundColor={receipt.page} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={kit.formPage}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            kit.formScroll,
            { paddingTop: insets.top + 20, paddingBottom: Math.max(insets.bottom, 12) + 24 },
          ]}
          bounces={false}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={[kit.formColumn, { maxWidth }]}>
            <View style={kit.formPaper}>
              {onBack ? (
                <Pressable onPress={onBack} style={kit.formBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back">
                  <Ionicons name="arrow-back" size={22} color={receipt.ink} />
                </Pressable>
              ) : null}
              <Mono style={kit.formBrand}>EZBILL</Mono>
              <Mono style={kit.formSubtitle}>{subtitle}</Mono>
              <ReceiptRule style={kit.formRule} />
              {title ? (
                <Display accessibilityRole="header" style={kit.formTitle}>
                  {title}
                </Display>
              ) : null}
              {description ? <Mono style={kit.formDescription}>{description}</Mono> : null}
              {children}
            </View>
            <PaperEdge />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const kit = StyleSheet.create({
  mono: {
    fontFamily: receiptFonts.mono,
    color: receipt.ink,
  },
  display: {
    fontFamily: receiptFonts.display,
    color: receipt.ink,
    fontWeight: "800",
  },
  edge: {
    height: TOOTH_WIDTH / 2,
    width: "100%",
    overflow: "hidden",
    position: "relative",
  },
  tooth: {
    position: "absolute",
    width: TOOTH_SIDE,
    height: TOOTH_SIDE,
    transform: [{ rotate: "45deg" }],
  },
  ruleClip: {
    height: 1,
    width: "100%",
    overflow: "hidden",
  },
  ruleLine: {
    height: 3,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 3,
  },
  rowText: {
    fontSize: 14,
    lineHeight: 22,
  },
  rowLabel: {
    flex: 1,
    minWidth: 0,
  },
  rowValue: {
    flexShrink: 0,
    maxWidth: "55%",
    textAlign: "right",
  },
  bold: {
    fontWeight: "700",
  },
  barcode: {
    flexDirection: "row",
    alignItems: "stretch",
    width: "100%",
    maxWidth: 320,
    alignSelf: "center",
  },
  button: {
    minHeight: 46,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: receipt.ink,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buttonInk: {
    backgroundColor: receipt.ink,
  },
  buttonOutline: {
    backgroundColor: "transparent",
  },
  buttonAccent: {
    backgroundColor: receipt.accent,
    borderColor: receipt.accent,
  },
  buttonPage: {
    backgroundColor: receipt.page,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  sectionTitle: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: receipt.accent,
  },
  sectionHeading: {
    fontSize: 38,
    lineHeight: 42,
    letterSpacing: -0.8,
  },
  sectionHeadingCompact: {
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.5,
  },
  sectionSubtitle: {
    fontSize: 14,
    lineHeight: 22,
    color: receipt.muted,
  },
  topBar: {
    width: "100%",
    backgroundColor: receipt.page,
    borderBottomWidth: 2,
    borderBottomColor: receipt.ink,
    zIndex: 100,
  },
  topBarInner: {
    width: "100%",
    maxWidth: 1440,
    alignSelf: "center",
    minHeight: 58,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  topBarLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  topBarBack: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarBrand: {
    fontSize: 18,
    fontWeight: "700",
  },
  topBarLabel: {
    flexShrink: 1,
    fontSize: 13,
    color: receipt.pageInk,
  },
  field: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
  },
  fieldBox: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 50,
    borderWidth: 2,
    borderColor: receipt.ink,
    borderRadius: 6,
    backgroundColor: receipt.paper,
  },
  fieldIcon: {
    marginLeft: 12,
  },
  fieldInput: {
    flex: 1,
    minWidth: 0,
    height: 46,
    paddingHorizontal: 12,
    fontFamily: receiptFonts.mono,
    fontSize: 15,
    color: receipt.ink,
  },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 2,
    borderRadius: 6,
    padding: 12,
    marginVertical: 10,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  formPage: {
    flex: 1,
    backgroundColor: receipt.page,
  },
  formScroll: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  formColumn: {
    width: "100%",
  },
  formPaper: {
    backgroundColor: receipt.paper,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 22,
  },
  formBack: {
    position: "absolute",
    top: 14,
    left: 12,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  formBrand: {
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  formSubtitle: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    color: receipt.muted,
  },
  formRule: {
    marginVertical: 16,
  },
  formTitle: {
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -0.6,
  },
  formDescription: {
    fontSize: 13,
    lineHeight: 20,
    color: receipt.muted,
    marginTop: 6,
    marginBottom: 18,
  },
});
