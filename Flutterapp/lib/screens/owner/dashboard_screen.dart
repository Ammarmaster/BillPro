import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/theme_provider.dart';
import '../../theme.dart';
import '../../api/api_service.dart';
import 'billing_screen.dart';
import '../auth/login_screen.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  Map<String, dynamic>? _summary;
  bool _loading = true;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _loadData();
    // Poll updates every 10 seconds to keep stats live
    _timer = Timer.periodic(const Duration(seconds: 10), (_) => _loadData(silent: true));
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _loadData({bool silent = false}) async {
    if (!silent) setState(() => _loading = true);
    try {
      final sum = await ApiService.get('/dashboard/summary');
      if (mounted) {
        setState(() {
          _summary = sum;
        });
      }
    } catch (e) {
      // Log error internally if needed
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = Provider.of<AuthProvider>(context);
    final themeProv = Provider.of<ThemeProvider>(context);
    final isDark = themeProv.isDarkMode;

    if (_loading && _summary == null) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator(color: AppTheme.brand)),
      );
    }

    final welcomeName = auth.user?.fullName ?? 'Business Partner';
    final todayRevenue = _summary?['revenue_today'] ?? 0;
    final totalOrders = _summary?['orders_total'] ?? _summary?['orders_open'] ?? 0;
    final avgBill = _summary?['avg_bill'] ?? 0;
    final webSales = _summary?['revenue_web_today'] ?? 0;
    final webSalesTotal = _summary?['revenue_web_total'] ?? 0;

    final pendingCount = _summary?['pending_count'] ?? _summary?['orders_open'] ?? 0;
    final cookingCount = _summary?['cooking_count'] ?? 0;
    final readyCount = _summary?['ready_count'] ?? 0;
    final tablesFree = _summary?['tables_free'] ?? 5;

    final List<dynamic> last7Days = _summary?['last_7_days'] ?? [
      {'date': 'Mon', 'revenue': 0},
      {'date': 'Tue', 'revenue': 0},
      {'date': 'Wed', 'revenue': 0},
      {'date': 'Thu', 'revenue': 0},
      {'date': 'Fri', 'revenue': 0},
      {'date': 'Sat', 'revenue': 0},
      {'date': 'Sun', 'revenue': 0},
    ];
    final double maxRevenue = last7Days.fold(100.0, (max, day) {
      final rev = (day['revenue'] ?? 0).toDouble();
      return rev > max ? rev : max;
    });

    final List<dynamic> topSelling = _summary?['top_selling'] ?? [];

    return Scaffold(
      appBar: AppBar(
        title: const Text('EzBill Console', style: TextStyle(fontFamily: 'Outfit', fontWeight: FontWeight.bold)),
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
        onRefresh: () => _loadData(silent: true),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16.0),
          physics: const AlwaysScrollableScrollPhysics(),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Welcome Header
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Welcome back,', style: TextStyle(color: isDark ? AppTheme.darkTextSecondary : AppTheme.lightTextSecondary, fontSize: 13)),
                      Text(welcomeName, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, fontFamily: 'Outfit')),
                    ],
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: AppTheme.brand.withOpacity(0.08),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: AppTheme.brand.withOpacity(0.15)),
                    ),
                    child: const Row(
                      children: [
                        Icon(Icons.shield_outlined, size: 14, color: AppTheme.brand),
                        SizedBox(width: 4),
                        Text('OWNER', style: TextStyle(color: AppTheme.brand, fontSize: 10, fontWeight: FontWeight.bold)),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // Hero Revenue Box
              Container(
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [AppTheme.brand, AppTheme.brandDark],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(24),
                  boxShadow: [
                    BoxShadow(
                      color: AppTheme.brand.withOpacity(0.25),
                      offset: const Offset(0, 8),
                      blurRadius: 16,
                    ),
                  ],
                ),
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 8,
                          height: 8,
                          decoration: const BoxDecoration(color: Colors.greenAccent, shape: BoxShape.circle),
                        ),
                        const SizedBox(width: 6),
                        const Text('LIVE SALES TODAY', style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: 0.8)),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '₹${todayRevenue.toString()}',
                      style: const TextStyle(color: Colors.white, fontSize: 36, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 16),
                    Divider(color: Colors.white.withOpacity(0.15)),
                    const SizedBox(height: 12),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        _buildHeroFooterItem('Total Orders', totalOrders.toString()),
                        _buildHeroFooterDivider(),
                        _buildHeroFooterItem('Average Ticket', '₹$avgBill'),
                        _buildHeroFooterDivider(),
                        _buildHeroFooterItem('Web Payments', '₹$webSales'),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),

              // Quick POS CTA
              ElevatedButton.icon(
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const BillingScreen()),
                  );
                },
                icon: const Icon(Icons.add_shopping_cart),
                label: const Text('Open POS Billing Screen', style: TextStyle(fontWeight: FontWeight.bold)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.brand,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                ),
              ),
              const SizedBox(height: 20),

              // Operational Grid
              Row(
                children: [
                  Expanded(child: _buildStatusCard(context, 'Pending', pendingCount.toString(), Icons.access_time, Colors.amber)),
                  const SizedBox(width: 12),
                  Expanded(child: _buildStatusCard(context, 'Cooking', cookingCount.toString(), Icons.local_fire_department, Colors.deepPurple)),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(child: _buildStatusCard(context, 'Ready', readyCount.toString(), Icons.check_circle_outline, Colors.teal)),
                  const SizedBox(width: 12),
                  Expanded(child: _buildStatusCard(context, 'Tables Free', tablesFree.toString(), Icons.grid_view, Colors.lightBlue)),
                ],
              ),
              const SizedBox(height: 20),

              // Web payments card
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Row(
                        children: [
                          Icon(Icons.public, size: 20, color: AppTheme.brand),
                          SizedBox(width: 8),
                          Text('Online Web Payments', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
                        ],
                      ),
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          Expanded(
                            child: Column(
                              children: [
                                Text('₹$webSales', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                                const SizedBox(height: 4),
                                const Text('Today', style: TextStyle(color: Colors.grey, fontSize: 11)),
                              ],
                            ),
                          ),
                          Container(width: 1, height: 32, color: isDark ? AppTheme.darkBorder : AppTheme.lightBorder),
                          Expanded(
                            child: Column(
                              children: [
                                Text('₹$webSalesTotal', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                                const SizedBox(height: 4),
                                const Text('Total Web Sales', style: TextStyle(color: Colors.grey, fontSize: 11)),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 20),

              // Chart Section
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Weekly Revenue Insights', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 24),
                      SizedBox(
                        height: 120,
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: last7Days.map<Widget>((day) {
                            final rev = (day['revenue'] ?? 0).toDouble();
                            final double pct = (rev / maxRevenue);
                            final height = (pct * 90).clamp(8.0, 90.0);

                            return Expanded(
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.end,
                                children: [
                                  Text(
                                    rev > 0 ? '₹${rev.toInt()}' : '',
                                    style: const TextStyle(fontSize: 8, fontWeight: FontWeight.bold),
                                  ),
                                  const SizedBox(height: 4),
                                  Container(
                                    width: 16,
                                    height: height,
                                    decoration: BoxDecoration(
                                      color: AppTheme.brand,
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    day['date'].toString(),
                                    style: const TextStyle(fontSize: 10, color: Colors.grey),
                                  ),
                                ],
                              ),
                            );
                          }).toList(),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 20),

              // Leaderboard Card
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Row(
                        children: [
                          Icon(Icons.emoji_events_outlined, size: 20, color: Colors.amber),
                          SizedBox(width: 8),
                          Text('Popular Leaderboard', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
                        ],
                      ),
                      const SizedBox(height: 12),
                      if (topSelling.isEmpty)
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 12.0),
                          child: Text('No items sold yet today.', style: TextStyle(color: Colors.grey, fontSize: 13)),
                        )
                      else
                        ...List.generate(topSelling.length, (idx) {
                          final item = topSelling[idx];
                          return ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: CircleAvatar(
                              backgroundColor: AppTheme.brand.withOpacity(0.08),
                              child: Text(
                                (idx + 1).toString(),
                                style: const TextStyle(color: AppTheme.brand, fontWeight: FontWeight.bold),
                              ),
                            ),
                            title: Text(item['name'] ?? '', style: const TextStyle(fontWeight: FontWeight.bold)),
                            subtitle: Text('${item['sold']} sold • ₹${item['amount']}', style: const TextStyle(fontSize: 12)),
                          );
                        }),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeroFooterItem(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(value, style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
        const SizedBox(height: 2),
        Text(label, style: const TextStyle(color: Colors.white70, fontSize: 11)),
      ],
    );
  }

  Widget _buildHeroFooterDivider() {
    return Container(width: 1, height: 24, color: Colors.white.withOpacity(0.15));
  }

  Widget _buildStatusCard(BuildContext context, String label, String value, IconData icon, Color color) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: color.withOpacity(0.08),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(icon, color: color, size: 20),
            ),
            const SizedBox(height: 12),
            Text(value, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
            Text(label, style: TextStyle(color: isDark ? AppTheme.darkTextSecondary : AppTheme.lightTextSecondary, fontSize: 12, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}
