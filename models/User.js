// User model for Supabase integration
// This is a placeholder model since we're using Supabase for authentication

class User {
  constructor(userData) {
    this.id = userData.id;
    this.email = userData.email;
    this.name = userData.name || '';
    this.phone = userData.phone || '';
    this.createdAt = userData.created_at || new Date().toISOString();
    this.updatedAt = userData.updated_at || new Date().toISOString();
  }

  static async findByEmail(email) {
    // This would typically query the database, but we're using Supabase
    // This is just a placeholder for compatibility
    return null;
  }

  static async findById(id) {
    // This would typically query the database, but we're using Supabase
    // This is just a placeholder for compatibility
    return null;
  }
}

module.exports = User;
