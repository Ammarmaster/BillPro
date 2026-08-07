import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ApiService {
  static const String baseUrl = 'https://billpro-g1th.onrender.com/api';

  static Future<String?> getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('auth_token');
  }

  static Future<void> saveToken(String token) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('auth_token', token);
  }

  static Future<void> clearToken() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('auth_token');
  }

  static Future<Map<String, String>> _getHeaders({bool auth = true}) async {
    final headers = {'Content-Type': 'application/json'};
    if (auth) {
      final token = await getToken();
      if (token != null) {
        headers['Authorization'] = 'Bearer $token';
      }
    }
    return headers;
  }

  static dynamic _handleResponse(http.Response response) {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (response.body.isEmpty) return null;
      return json.decode(response.body);
    } else {
      String errMsg = 'Request failed';
      try {
        final errBody = json.decode(response.body);
        errMsg = errBody['detail'] ?? errMsg;
      } catch (_) {}
      throw Exception(errMsg);
    }
  }

  // --- GET ---
  static Future<dynamic> get(String path, {bool auth = true}) async {
    final headers = await _getHeaders(auth: auth);
    final response = await http.get(Uri.parse('$baseUrl$path'), headers: headers);
    return _handleResponse(response);
  }

  // --- POST ---
  static Future<dynamic> post(String path, dynamic body, {bool auth = true}) async {
    final headers = await _getHeaders(auth: auth);
    final response = await http.post(
      Uri.parse('$baseUrl$path'),
      headers: headers,
      body: json.encode(body),
    );
    return _handleResponse(response);
  }

  // --- DELETE ---
  static Future<dynamic> delete(String path, {bool auth = true}) async {
    final headers = await _getHeaders(auth: auth);
    final response = await http.delete(Uri.parse('$baseUrl$path'), headers: headers);
    return _handleResponse(response);
  }

  // --- PUT ---
  static Future<dynamic> put(String path, dynamic body, {bool auth = true}) async {
    final headers = await _getHeaders(auth: auth);
    final response = await http.put(
      Uri.parse('$baseUrl$path'),
      headers: headers,
      body: json.encode(body),
    );
    return _handleResponse(response);
  }

  // --- PATCH ---
  static Future<dynamic> patch(String path, dynamic body, {bool auth = true}) async {
    final headers = await _getHeaders(auth: auth);
    final response = await http.patch(
      Uri.parse('$baseUrl$path'),
      headers: headers,
      body: json.encode(body),
    );
    return _handleResponse(response);
  }
}
