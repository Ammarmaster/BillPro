import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/theme_provider.dart';
import '../../api/api_service.dart';
import '../../theme.dart';
import '../auth/login_screen.dart';

class KitchenScreen extends StatefulWidget {
  const KitchenScreen({super.key});

  @override
  State<KitchenScreen> createState() => _KitchenScreenState();
}

class _KitchenScreenState extends State<KitchenScreen> {
  List<dynamic> _kitchenOrders = [];
  bool _loading = true;
  String? _error;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _loadKitchenOrders();
    _timer = Timer.periodic(const Duration(seconds: 6), (_) => _loadKitchenOrders(silent: true));
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _loadKitchenOrders({bool silent = false}) async {
    if (!silent) setState(() => _loading = true);
    try {
      final List<dynamic> orders = await ApiService.get('/orders?status_filter=pending,cooking');
      if (mounted) {
        setState(() {
          _kitchenOrders = orders;
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
      _loadKitchenOrders(silent: true);
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
        title: const Text('Kitchen Display (KDS)', style: TextStyle(fontFamily: 'Outfit', fontWeight: FontWeight.bold)),
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
        onRefresh: () => _loadKitchenOrders(silent: true),
        child: _loading && _kitchenOrders.isEmpty
            ? const Center(child: CircularProgressIndicator(color: AppTheme.brand))
            : _error != null
                ? Center(child: Text('Error: $_error', style: const TextStyle(color: AppTheme.error)))
                : _kitchenOrders.isEmpty
                    ? const Center(
                        child: Text(
                          'No orders in the cooking queue.',
                          style: TextStyle(color: Colors.grey, fontSize: 14),
                        ),
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _kitchenOrders.length,
                        itemBuilder: (context, index) {
                          final order = _kitchenOrders[index];
                          final id = order['id'];
                          final table = order['table_number'] ?? '-';
                          final status = order['status'] ?? 'pending';
                          final timeStr = order['created_at'] != null 
                              ? DateTime.parse(order['created_at']).toLocal().toString().substring(11, 16)
                              : '';
                          final List<dynamic> items = order['items'] ?? [];
                          final notes = order['notes'] ?? '';

                          Color statusColor = status == 'cooking' ? Colors.purple : Colors.amber;

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
                                      Row(
                                        children: [
                                          Text(timeStr, style: const TextStyle(color: Colors.grey, fontSize: 13)),
                                          const SizedBox(width: 8),
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
                                    ],
                                  ),
                                  const SizedBox(height: 12),
                                  const Divider(),
                                  const SizedBox(height: 8),
                                  ...items.map<Widget>((it) {
                                    return Padding(
                                      padding: const EdgeInsets.symmetric(vertical: 6.0),
                                      child: Row(
                                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                        children: [
                                          Text(
                                            '${it['name'] ?? 'Item'}',
                                            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                                          ),
                                          Text(
                                            'x${it['quantity']}',
                                            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: AppTheme.brand),
                                          ),
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
                                          const Icon(Icons.info_outline, size: 18, color: Colors.orange),
                                          const SizedBox(width: 8),
                                          Expanded(
                                            child: Text(
                                              notes,
                                              style: const TextStyle(color: Colors.orange, fontSize: 13, fontWeight: FontWeight.bold),
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
                                        ElevatedButton.icon(
                                          icon: const Icon(Icons.play_arrow),
                                          label: const Text('Cook Now'),
                                          style: ElevatedButton.styleFrom(
                                            backgroundColor: Colors.purple,
                                            foregroundColor: Colors.white,
                                          ),
                                          onPressed: () => _updateStatus(id, 'cooking'),
                                        ),
                                      if (status == 'cooking')
                                        ElevatedButton.icon(
                                          icon: const Icon(Icons.done_all),
                                          label: const Text('Finish Cooking'),
                                          style: ElevatedButton.styleFrom(
                                            backgroundColor: Colors.teal,
                                            foregroundColor: Colors.white,
                                          ),
                                          onPressed: () => _updateStatus(id, 'ready'),
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
