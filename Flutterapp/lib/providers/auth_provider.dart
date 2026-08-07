import 'package:flutter/material.dart';
import '../api/api_service.dart';

class User {
  final String id;
  final String fullName;
  final String email;
  final String role;
  final String? tenantId;

  User({
    required this.id,
    required this.fullName,
    required this.email,
    required this.role,
    this.tenantId,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] ?? '',
      fullName: json['full_name'] ?? '',
      email: json['email'] ?? '',
      role: json['role'] ?? '',
      tenantId: json['tenant_id'],
    );
  }
}

class AuthProvider extends ChangeNotifier {
  User? _user;
  bool _loading = true;

  User? get user => _user;
  bool get loading => _loading;
  bool get isAuthenticated => _user != null;

  AuthProvider() {
    checkSession();
  }

  Future<void> checkSession() async {
    _loading = true;
    notifyListeners();
    try {
      final token = await ApiService.getToken();
      if (token != null) {
        final profile = await ApiService.get('/auth/me');
        _user = User.fromJson(profile);
      } else {
        _user = null;
      }
    } catch (_) {
      _user = null;
      await ApiService.clearToken();
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> login(String email, String password) async {
    _loading = true;
    notifyListeners();
    try {
      final res = await ApiService.post('/auth/login', {
        'email': email,
        'password': password,
      }, auth: false);
      
      final token = res['access_token'];
      if (token != null) {
        await ApiService.saveToken(token);
        _user = User.fromJson(res['user']);
      }
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> register(String name, String email, String password, String role) async {
    _loading = true;
    notifyListeners();
    try {
      final res = await ApiService.post('/auth/register', {
        'full_name': name,
        'email': email,
        'password': password,
        'role': role,
      }, auth: false);
      
      final token = res['access_token'];
      if (token != null) {
        await ApiService.saveToken(token);
        _user = User.fromJson(res['user']);
      }
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> staffLogin(String restaurantPin, String role) async {
    _loading = true;
    notifyListeners();
    try {
      final res = await ApiService.post('/auth/staff-login', {
        'pin': restaurantPin,
        'role': role,
      }, auth: false);
      
      final token = res['access_token'];
      if (token != null) {
        await ApiService.saveToken(token);
        _user = User.fromJson(res['user']);
      }
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> logout() async {
    await ApiService.clearToken();
    _user = null;
    notifyListeners();
  }

  void updateTenantId(String tid) {
    if (_user != null) {
      _user = User(
        id: _user!.id,
        fullName: _user!.fullName,
        email: _user!.email,
        role: _user!.role,
        tenantId: tid,
      );
      notifyListeners();
    }
  }
}
