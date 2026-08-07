import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'theme.dart';
import 'providers/auth_provider.dart';
import 'providers/theme_provider.dart';
import 'providers/cart_provider.dart';
import 'screens/auth/login_screen.dart';
import 'screens/owner/dashboard_screen.dart';
import 'screens/waiter/waiter_screen.dart';
import 'screens/kitchen/kitchen_screen.dart';
import 'screens/admin/admin_plans_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()),
        ChangeNotifierProvider(create: (_) => ThemeProvider()),
        ChangeNotifierProvider(create: (_) => CartProvider()),
      ],
      child: const MyApp(),
    ),
  );
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    final themeProvider = Provider.of<ThemeProvider>(context);
    return MaterialApp(
      title: 'EzBill POS',
      debugShowCheckedModeBanner: false,
      themeMode: themeProvider.themeMode,
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      home: const RootNavigationGate(),
    );
  }
}

class RootNavigationGate extends StatelessWidget {
  const RootNavigationGate({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = Provider.of<AuthProvider>(context);

    if (auth.loading) {
      return const Scaffold(
        body: Center(
          child: CircularProgressIndicator(color: AppTheme.brand),
        ),
      );
    }

    if (!auth.isAuthenticated) {
      return const LoginScreen();
    }

    final role = auth.user?.role;
    if (role == 'super_admin' || role == 'admin_employee') {
      return const AdminPlansScreen(); // Or admin shell
    } else if (role == 'waiter') {
      return const WaiterScreen();
    } else if (role == 'kitchen') {
      return const KitchenScreen();
    } else {
      return const DashboardScreen();
    }
  }
}
