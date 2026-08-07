import 'package:flutter/material.dart';
import '../models/models.dart';

class CartProvider extends ChangeNotifier {
  final List<CartItem> _items = [];
  String _tableNumber = '';
  String _notes = '';
  String _orderType = 'dine_in'; // dine_in / takeaway

  List<CartItem> get items => _items;
  String get tableNumber => _tableNumber;
  String get notes => _notes;
  String get orderType => _orderType;

  int get itemCount => _items.fold(0, (sum, item) => sum + item.quantity);
  double get subtotal => _items.fold(0.0, (sum, item) => sum + (item.item.price * item.quantity));

  void addItem(MenuItem item) {
    final idx = _items.indexWhere((element) => element.item.id == item.id);
    if (idx >= 0) {
      _items[idx].quantity++;
    } else {
      _items.add(CartItem(item: item));
    }
    notifyListeners();
  }

  void removeItem(MenuItem item) {
    _items.removeWhere((element) => element.item.id == item.id);
    notifyListeners();
  }

  void decrementItem(MenuItem item) {
    final idx = _items.indexWhere((element) => element.item.id == item.id);
    if (idx >= 0) {
      if (_items[idx].quantity > 1) {
        _items[idx].quantity--;
      } else {
        _items.removeAt(idx);
      }
      notifyListeners();
    }
  }

  void clear() {
    _items.clear();
    _tableNumber = '';
    _notes = '';
    _orderType = 'dine_in';
    notifyListeners();
  }

  void setTableNumber(String table) {
    _tableNumber = table;
    notifyListeners();
  }

  void setNotes(String notes) {
    _notes = notes;
    notifyListeners();
  }

  void setOrderType(String type) {
    _orderType = type;
    notifyListeners();
  }
}
