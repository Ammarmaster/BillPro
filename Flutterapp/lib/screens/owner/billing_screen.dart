import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/cart_provider.dart';
import '../../providers/theme_provider.dart';
import '../../models/models.dart';
import '../../api/api_service.dart';
import '../../theme.dart';

class BillingScreen extends StatefulWidget {
  const BillingScreen({super.key});

  @override
  State<BillingScreen> createState() => _BillingScreenState();
}

class _BillingScreenState extends State<BillingScreen> {
  List<Category> _categories = [];
  List<MenuItem> _menuItems = [];
  String _selectedCategoryId = 'all';
  bool _loading = true;
  String? _error;
  final _tableController = TextEditingController();
  final _notesController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadMenuData();
  }

  @override
  void dispose() {
    _tableController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _loadMenuData() async {
    setState(() => _loading = true);
    try {
      final List<dynamic> cats = await ApiService.get('/categories');
      final List<dynamic> items = await ApiService.get('/menu-items');
      
      setState(() {
        _categories = cats.map((c) => Category.fromJson(c)).toList();
        _menuItems = items.map((i) => MenuItem.fromJson(i)).toList();
        _error = null;
      });
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _checkout(CartProvider cart) async {
    if (cart.items.isEmpty) return;
    
    final tableNum = _tableController.text.trim();
    if (tableNum.isEmpty && cart.orderType == 'dine_in') {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a table number for dine-in orders')),
      );
      return;
    }

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => const Center(child: CircularProgressIndicator(color: AppTheme.brand)),
    );

    try {
      // 1. Create Order
      final orderBody = {
        'table_number': cart.orderType == 'takeaway' ? 'Takeaway' : tableNum,
        'items': cart.items.map((i) => {
          'item_id': i.item.id,
          'quantity': i.quantity,
          'notes': _notesController.text.trim(),
        }).toList(),
        'notes': _notesController.text.trim(),
      };

      final orderRes = await ApiService.post('/orders', orderBody);
      final orderId = orderRes['id'];

      // 2. Generate Bill (Checkout)
      await ApiService.post('/bills', {
        'order_id': orderId,
        'tax_percent': 5,
        'discount': 0.0,
      });

      // Clear Cart & Dialog
      cart.clear();
      _tableController.clear();
      _notesController.clear();
      
      if (mounted) {
        Navigator.pop(context); // Pop loading dialog
        _showSuccessDialog();
      }
    } catch (e) {
      if (mounted) {
        Navigator.pop(context); // Pop loading dialog
        showDialog(
          context: context,
          builder: (_) => AlertDialog(
            title: const Text('Checkout Error'),
            content: Text(e.toString().replaceFirst('Exception: ', '')),
            actions: [
              TextButton(onPressed: () => Navigator.pop(context), child: const Text('OK')),
            ],
          ),
        );
      }
    }
  }

  void _showSuccessDialog() {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.check_circle, size: 64, color: AppTheme.success),
            const SizedBox(height: 16),
            const Text('Bill Generated!', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, fontFamily: 'Outfit')),
            const SizedBox(height: 8),
            const Text('The checkout order was synced successfully with the database.', textAlign: TextAlign.center, style: TextStyle(color: Colors.grey, fontSize: 13)),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(context); // Pop success dialog
                Navigator.pop(context); // Pop billing screen
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.brand,
                padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: const Text('Return Console', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cart = Provider.of<CartProvider>(context);
    final themeProv = Provider.of<ThemeProvider>(context);
    final isDark = themeProv.isDarkMode;

    final filteredItems = _selectedCategoryId == 'all'
        ? _menuItems
        : _menuItems.where((item) => item.categoryId == _selectedCategoryId).toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('POS Terminal', style: TextStyle(fontFamily: 'Outfit', fontWeight: FontWeight.bold)),
        actions: [
          if (cart.items.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.delete_sweep, color: AppTheme.error),
              onPressed: () => cart.clear(),
            ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppTheme.brand))
          : _error != null
              ? Center(child: Text('Error: $_error', style: const TextStyle(color: AppTheme.error)))
              : Column(
                  children: [
                    // Horizontal Scrollable Category Bar
                    SizedBox(
                      height: 56,
                      child: ListView.builder(
                        scrollDirection: Axis.horizontal,
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        itemCount: _categories.length + 1,
                        itemBuilder: (context, index) {
                          final isAll = index == 0;
                          final catId = isAll ? 'all' : _categories[index - 1].id;
                          final catName = isAll ? 'All Items' : _categories[index - 1].name;
                          final isSelected = _selectedCategoryId == catId;

                          return Padding(
                            padding: const EdgeInsets.only(right: 8.0),
                            child: ChoiceChip(
                              label: Text(catName),
                              selected: isSelected,
                              onSelected: (_) => setState(() => _selectedCategoryId = catId),
                              selectedColor: AppTheme.brand,
                              labelStyle: TextStyle(
                                color: isSelected ? Colors.white : (isDark ? AppTheme.darkText : AppTheme.lightText),
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          );
                        },
                      ),
                    ),

                    // Grid of Menu Items
                    Expanded(
                      child: GridView.builder(
                        padding: const EdgeInsets.all(16),
                        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          childAspectRatio: 0.8,
                          crossAxisSpacing: 12,
                          mainAxisSpacing: 12,
                        ),
                        itemCount: filteredItems.length,
                        itemBuilder: (context, index) {
                          final item = filteredItems[index];
                          final cartItem = cart.items.firstWhere(
                            (el) => el.item.id == item.id,
                            orElse: () => CartItem(item: item, quantity: 0),
                          );

                          return Card(
                            child: Padding(
                              padding: const EdgeInsets.all(12.0),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  // Placeholder Icon
                                  Expanded(
                                    child: Container(
                                      decoration: BoxDecoration(
                                        color: AppTheme.brand.withOpacity(0.04),
                                        borderRadius: BorderRadius.circular(12),
                                      ),
                                      child: const Center(
                                        child: Icon(Icons.fastfood, color: AppTheme.brand, size: 36),
                                      ),
                                    ),
                                  ),
                                  const SizedBox(height: 8),
                                  Text(
                                    item.name,
                                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    '₹${item.price.toInt()}',
                                    style: const TextStyle(color: AppTheme.brand, fontWeight: FontWeight.bold, fontSize: 13),
                                  ),
                                  const SizedBox(height: 8),

                                  // Cart controls
                                  if (cartItem.quantity > 0)
                                    Row(
                                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                      children: [
                                        IconButton(
                                          icon: const Icon(Icons.remove_circle_outline, size: 20),
                                          onPressed: () => cart.decrementItem(item),
                                        ),
                                        Text('${cartItem.quantity}', style: const TextStyle(fontWeight: FontWeight.bold)),
                                        IconButton(
                                          icon: const Icon(Icons.add_circle_outline, size: 20),
                                          onPressed: () => cart.addItem(item),
                                        ),
                                      ],
                                    )
                                  else
                                    ElevatedButton(
                                      onPressed: () => cart.addItem(item),
                                      style: ElevatedButton.styleFrom(
                                        backgroundColor: AppTheme.brand.withOpacity(0.1),
                                        foregroundColor: AppTheme.brand,
                                        elevation: 0,
                                        padding: EdgeInsets.zero,
                                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                                      ),
                                      child: const Text('Add to Cart', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                                    ),
                                ],
                              ),
                            ),
                          );
                        },
                      ),
                    ),
                  ],
                ),
      bottomNavigationBar: cart.items.isNotEmpty
          ? Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: isDark ? AppTheme.darkSurfaceSecondary : AppTheme.lightSurfaceSecondary,
                border: Border(top: BorderSide(color: isDark ? AppTheme.darkBorder : AppTheme.lightBorder)),
              ),
              child: SafeArea(
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text('${cart.itemCount} items', style: const TextStyle(color: Colors.grey, fontSize: 12)),
                        Text(
                          '₹${cart.subtotal.toInt()}',
                          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: AppTheme.brand),
                        ),
                      ],
                    ),
                    ElevatedButton(
                      onPressed: () => _showCheckoutSheet(context, cart),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.brand,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      child: const Text('Proceed Checkout', style: TextStyle(fontWeight: FontWeight.bold)),
                    ),
                  ],
                ),
              ),
            )
          : null,
    );
  }

  void _showCheckoutSheet(BuildContext context, CartProvider cart) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.only(topLeft: Radius.circular(24), topRight: Radius.circular(24)),
      ),
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setSheetState) {
            return Padding(
              padding: EdgeInsets.only(
                bottom: MediaQuery.of(context).viewInsets.bottom,
                left: 20,
                right: 20,
                top: 20,
              ),
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('Checkout Details', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, fontFamily: 'Outfit')),
                    const SizedBox(height: 16),

                    // Order Type Segmented Switcher
                    Row(
                      children: [
                        Expanded(
                          child: ChoiceChip(
                            label: const Center(child: Text('Dine-In')),
                            selected: cart.orderType == 'dine_in',
                            onSelected: (_) {
                              setSheetState(() => cart.setOrderType('dine_in'));
                            },
                          ),
                        ),
                        const SizedBox(width: 16),
                        Expanded(
                          child: ChoiceChip(
                            label: const Center(child: Text('Take-Away')),
                            selected: cart.orderType == 'takeaway',
                            onSelected: (_) {
                              setSheetState(() => cart.setOrderType('takeaway'));
                            },
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),

                    // Table Number input
                    if (cart.orderType == 'dine_in') ...[
                      TextField(
                        controller: _tableController,
                        decoration: InputDecoration(
                          labelText: 'Table Number / Label',
                          prefixIcon: const Icon(Icons.table_restaurant_outlined),
                          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],

                    // Kitchen notes input
                    TextField(
                      controller: _notesController,
                      decoration: InputDecoration(
                        labelText: 'Special Cooking Notes (optional)',
                        prefixIcon: const Icon(Icons.description_outlined),
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                    ),
                    const SizedBox(height: 24),

                    // Totals Summary
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Basket Subtotal', style: TextStyle(fontSize: 14, color: Colors.grey)),
                        Text('₹${cart.subtotal.toInt()}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('GST / Taxes (5%)', style: TextStyle(fontSize: 14, color: Colors.grey)),
                        Text('₹${(cart.subtotal * 0.05).toInt()}', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                      ],
                    ),
                    const SizedBox(height: 8),
                    const Divider(),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Grand Total', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                        Text(
                          '₹${(cart.subtotal * 1.05).toInt()}',
                          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: AppTheme.brand),
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),

                    ElevatedButton(
                      onPressed: () {
                        Navigator.pop(context); // Close bottom sheet
                        _checkout(cart);
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.brand,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      child: const Text('Generate Bill & Print', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                    ),
                    const SizedBox(height: 20),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }
}
