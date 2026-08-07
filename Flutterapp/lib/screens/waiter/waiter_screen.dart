import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/theme_provider.dart';
import '../../api/api_service.dart';
import '../../theme.dart';
import '../auth/login_screen.dart';

class WaiterScreen extends StatefulWidget {
  const WaiterScreen({super.key});

  @override
  State<WaiterScreen> createState() => _WaiterScreenState();
}

class _WaiterScreenState extends State<WaiterScreen> {
  List<dynamic> _orders = [];
  bool _loading = true;
  String? _error;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _loadOrders();
    _timer = Timer.periodic(const Duration(seconds: 8), (_) => _loadOrders(silent: true));
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _loadOrders({bool silent = false}) async {
    if (!silent) setState(() => _loading = true);
    try {
      final List<dynamic> orders = await ApiService.get('/orders');
      if (mounted) {
        setState(() {
          _orders = orders;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted && !silent) {
        setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _updateStatus(String id, String status) async {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => const Center(child: CircularProgressIndicator(color: AppTheme.brand)),
    );
    try {
      await ApiService.patch('/orders/$id/status', {'status': status});
      Navigator.pop(context); // Pop loading dialog
      _loadOrders(silent: true);
    } catch (e) {
      Navigator.pop(context); // Pop loading dialog
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to update status: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = Provider.of<AuthProvider>(context);
    final themeProv = Provider.of<ThemeProvider>(context);
    final isDark = themeProv.isDarkMode;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Waiter Terminal', style: TextStyle(fontFamily: 'Outfit', fontWeight: FontWeight.bold)),
        actions: [
          IconButton(
            icon: Icon(isDark ? Icons.light_mode : Icons.dark_mode),
            onPressed: () => themeProv.toggleTheme(),
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              await auth.logout();
              if (mounted) {
                Navigator.of(context).pushReplacement(
                  MaterialPageRoute(builder: (_) => const LoginScreen()),
                );
              }
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        color: AppTheme.brand,
        onRefresh: () => _loadOrders(silent: true),
        child: _loading && _orders.isEmpty
            ? const Center(child: CircularProgressIndicator(color: AppTheme.brand))
            : _error != null
                ? Center(child: Text('Error: $_error', style: const TextStyle(color: AppTheme.error)))
                : _orders.isEmpty
                    ? const Center(
                        child: Text(
                          'No active orders right now.',
                          style: TextStyle(color: Colors.grey, fontSize: 14),
                        ),
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _orders.length,
                        itemBuilder: (context, index) {
                          final order = _orders[index];
                          final id = order['id'];
                          final table = order['table_number'] ?? '-';
                          final status = order['status'] ?? 'pending';
                          final timeStr = order['created_at'] != null 
                              ? DateTime.parse(order['created_at']).toLocal().toString().substring(11, 16)
                              : '';
                          final List<dynamic> items = order['items'] ?? [];
                          final notes = order['notes'] ?? '';

                          Color statusColor = Colors.amber;
                          if (status == 'cooking') statusColor = Colors.purple;
                          if (status == 'ready') statusColor = Colors.teal;
                          if (status == 'served') statusColor = Colors.grey;

                          return Card(
                            margin: const EdgeInsets.only(bottom: 16),
                            child: Padding(
                              padding: const EdgeInsets.all(16.0),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      Text(
                                        'Table $table',
                                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, fontFamily: 'Outfit'),
                                      ),
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                        decoration: BoxDecoration(
                                          color: statusColor.withOpacity(0.08),
                                          borderRadius: BorderRadius.circular(12),
                                          border: Border.all(color: statusColor.withOpacity(0.2)),
                                        ),
                                        child: Text(
                                          status.toUpperCase(),
                                          style: TextStyle(color: statusColor, fontSize: 11, fontWeight: FontWeight.bold),
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    'Time: $timeStr',
                                    style: const TextStyle(color: Colors.grey, fontSize: 12),
                                  ),
                                  const SizedBox(height: 12),
                                  const Divider(),
                                  const SizedBox(height: 8),
                                  ...items.map<Widget>((it) {
                                    return Padding(
                                      padding: const EdgeInsets.symmetric(vertical: 4.0),
                                      child: Row(
                                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                        children: [
                                          Text(
                                            '${it['name'] ?? 'Item'}',
                                            style: const TextStyle(fontWeight: FontWeight.bold),
                                          ),
                                          Text('x${it['quantity']}'),
                                        ],
                                      ),
                                    );
                                  }).toList(),
                                  if (notes.isNotEmpty) ...[
                                    const SizedBox(height: 12),
                                    Container(
                                      padding: const EdgeInsets.all(10),
                                      decoration: BoxDecoration(
                                        color: Colors.amber.withOpacity(0.08),
                                        borderRadius: BorderRadius.circular(8),
                                        border: Border.all(color: Colors.amber.withOpacity(0.2)),
                                      ),
                                      child: Row(
                                        children: [
                                          const Icon(Icons.info_outline, size: 16, color: Colors.orange),
                                          const SizedBox(width: 8),
                                          Expanded(
                                            child: Text(
                                              notes,
                                              style: const TextStyle(color: Colors.orange, fontSize: 12, fontWeight: FontWeight.bold),
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                  const SizedBox(height: 16),
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.end,
                                    children: [
                                      if (status == 'pending')
                                        TextButton.icon(
                                          icon: const Icon(Icons.play_circle_outline, size: 18),
                                          label: const Text('Start Cooking'),
                                          onPressed: () => _updateStatus(id, 'cooking'),
                                        ),
                                      if (status == 'cooking')
                                        TextButton.icon(
                                          icon: const Icon(Icons.check_circle_outline, size: 18, color: Colors.teal),
                                          label: const Text('Mark Ready', style: TextStyle(color: Colors.teal)),
                                          onPressed: () => _updateStatus(id, 'ready'),
                                        ),
                                      if (status == 'ready')
                                        TextButton.icon(
                                          icon: const Icon(Icons.check, size: 18, color: Colors.grey),
                                          label: const Text('Mark Served', style: TextStyle(color: Colors.grey)),
                                          onPressed: () => _updateStatus(id, 'served'),
                                        ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
      ),
    );
  }
}
