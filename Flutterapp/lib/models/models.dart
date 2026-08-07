class Category {
  final String id;
  final String name;

  Category({required this.id, required this.name});

  factory Category.fromJson(Map<String, dynamic> json) {
    return Category(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
    );
  }
}

class MenuItem {
  final String id;
  final String categoryId;
  final String name;
  final double price;
  final String description;
  final String? imageUrl;
  final bool isActive;

  MenuItem({
    required this.id,
    required this.categoryId,
    required this.name,
    required this.price,
    required this.description,
    this.imageUrl,
    required this.isActive,
  });

  factory MenuItem.fromJson(Map<String, dynamic> json) {
    return MenuItem(
      id: json['id'] ?? '',
      categoryId: json['category_id'] ?? '',
      name: json['name'] ?? '',
      price: (json['price'] ?? 0.0).toDouble(),
      description: json['description'] ?? '',
      imageUrl: json['image_url'],
      isActive: json['is_active'] ?? true,
    );
  }
}

class Restaurant {
  final String id;
  final String name;
  final String? address;
  final String? phone;
  final String? ownerName;
  final String? ownerEmail;
  final String? upiId;

  Restaurant({
    required this.id,
    required this.name,
    this.address,
    this.phone,
    this.ownerName,
    this.ownerEmail,
    this.upiId,
  });

  factory Restaurant.fromJson(Map<String, dynamic> json) {
    return Restaurant(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      address: json['address'],
      phone: json['phone'],
      ownerName: json['owner_name'],
      ownerEmail: json['owner_email'],
      upiId: json['upi_id'],
    );
  }
}

class CartItem {
  final MenuItem item;
  int quantity;

  CartItem({required this.item, this.quantity = 1});
}
