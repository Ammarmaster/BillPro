import 'package:flutter/material.dart';

class AppTheme {
  static const Color brand = Color(0xFF635BFF);
  static const Color brandDark = Color(0xFF4F46E5);
  
  // Light Mode Colors
  static const Color lightSurface = Color(0xFFFFFFFF);
  static const Color lightSurfaceSecondary = Color(0xFFF8FAFC);
  static const Color lightSurfaceTertiary = Color(0xFFF1F5F9);
  static const Color lightText = Color(0xFF0F172A);
  static const Color lightTextSecondary = Color(0xFF475569);
  static const Color lightTextTertiary = Color(0xFF94A3B8);
  static const Color lightBorder = Color(0xFFE2E8F0);
  
  // Dark Mode Colors
  static const Color darkSurface = Color(0xFF090A0F);
  static const Color darkSurfaceSecondary = Color(0xFF151722);
  static const Color darkSurfaceTertiary = Color(0xFF1E2130);
  static const Color darkText = Color(0xFFF8FAFC);
  static const Color darkTextSecondary = Color(0xFF94A3B8);
  static const Color darkTextTertiary = Color(0xFF64748B);
  static const Color darkBorder = Color(0xFF2E3245);

  static const Color error = Color(0xFFEF4444);
  static const Color success = Color(0xFF10B981);
  static const Color warning = Color(0xFFF59E0B);
  static const Color info = Color(0xFF0EA5E9);

  static ThemeData lightTheme = ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    primaryColor: brand,
    scaffoldBackgroundColor: lightSurface,
    colorScheme: const ColorScheme.light(
      primary: brand,
      surface: lightSurface,
      onSurface: lightText,
      error: error,
    ),
    textTheme: const TextTheme(
      titleLarge: TextStyle(color: lightText, fontSize: 22, fontWeight: FontWeight.bold, fontFamily: 'Outfit'),
      titleMedium: TextStyle(color: lightText, fontSize: 16, fontWeight: FontWeight.w600, fontFamily: 'Outfit'),
      bodyLarge: TextStyle(color: lightText, fontSize: 14, fontFamily: 'Inter'),
      bodyMedium: TextStyle(color: lightTextSecondary, fontSize: 12, fontFamily: 'Inter'),
    ),
    dividerColor: lightBorder,
    cardTheme: CardThemeData(
      color: lightSurfaceSecondary,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: lightBorder),
      ),
    ),
  );

  static ThemeData darkTheme = ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    primaryColor: brand,
    scaffoldBackgroundColor: darkSurface,
    colorScheme: const ColorScheme.dark(
      primary: brand,
      surface: darkSurface,
      onSurface: darkText,
      error: error,
    ),
    textTheme: const TextTheme(
      titleLarge: TextStyle(color: darkText, fontSize: 22, fontWeight: FontWeight.bold, fontFamily: 'Outfit'),
      titleMedium: TextStyle(color: darkText, fontSize: 16, fontWeight: FontWeight.w600, fontFamily: 'Outfit'),
      bodyLarge: TextStyle(color: darkText, fontSize: 14, fontFamily: 'Inter'),
      bodyMedium: TextStyle(color: darkTextSecondary, fontSize: 12, fontFamily: 'Inter'),
    ),
    dividerColor: darkBorder,
    cardTheme: CardThemeData(
      color: darkSurfaceSecondary,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: darkBorder),
      ),
    ),
  );
}
