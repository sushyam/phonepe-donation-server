const { createClient } = require('@supabase/supabase-js');
const { SUPABASE_URL, SUPABASE_KEY } = require('../config/supabase');

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Helper: Map DB donation (snake_case) to JS (camelCase)
function mapDonationFromDb(dbDonation) {
  if (!dbDonation) return dbDonation;
  return {
    ...dbDonation,
    userId: dbDonation.user_id,
    paymentId: dbDonation.payment_id,
    donorInfo: dbDonation.donor_info,
    familyInfo: dbDonation.family_info,
    paymentDetails: dbDonation.payment_details,
    createdAt: dbDonation.created_at,
    updatedAt: dbDonation.updated_at,
    // fallback to camelCase for status
    status: dbDonation.status,
    amount: dbDonation.amount,
    type: dbDonation.type,
    frequency: dbDonation.frequency,
    id: dbDonation.id,
    paymentUrl: dbDonation.payment_url
  };
}

// Donation service
const donationService = {
  // Create a new donation
  async createDonation(donationData) {
    const { data, error } = await supabase
      .from('donations')
      .insert([donationData])
      .select()
      .single();
    
    if (error) throw error;
    return mapDonationFromDb(data);
  },

  // Get donation by ID
  async getDonationById(id) {
    const { data, error } = await supabase
      .from('donations')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return mapDonationFromDb(data);
  },

  // Get donations by user ID
  async getDonationsByUserId(userId) {
    const { data, error } = await supabase
      .from('donations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return Array.isArray(data) ? data.map(mapDonationFromDb) : [];
  },

  // Update donation
  async updateDonation(id, updates) {
    const { data, error } = await supabase
      .from('donations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return mapDonationFromDb(data);
  },

  // Delete donation
  async deleteDonation(id) {
    const { error } = await supabase
      .from('donations')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    return true;
  },

  // Find donation by payment ID
  async findDonationByPaymentId(paymentId) {
    const { data, error } = await supabase
      .from('donations')
      .select('*')
      .eq('payment_id', paymentId)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "No rows returned"
    return mapDonationFromDb(data);
  }
};

// User service
const userService = {
  // Sign up with email and password
  async signUp(email, password, userData) {
    try {
      // Create auth user
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: userData
        }
      });
      
      if (error) throw error;
      
      // Also create a record in the users table
      if (data.user) {
        try {
          await supabase
            .from('users')
            .insert([{
              id: data.user.id,
              email: data.user.email,
              name: userData.name,
              phone: userData.phone || ''
            }]);
        } catch (insertError) {
          console.error('Error inserting user data:', insertError);
          // Continue even if this fails, as the auth user is created
        }
      }
      
      return { user: data.user, error: null };
    } catch (err) {
      console.error('Sign up error:', err);
      return { user: null, error: err };
    }
  },
  
  // Sign in with email and password
  async signIn(email, password) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      
      return { data, error };
    } catch (err) {
      console.error('Sign in error:', err);
      return { data: null, error: err };
    }
  },
  
  // Get current user
  async getCurrentUser() {
    const { data, error } = await supabase.auth.getUser();
    
    if (error) return null;
    return data.user;
  },
  
  // Get user profile
  async getUserProfile(userId) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (error) return null;
    return data;
  },
  
  // Resend confirmation email
  async resendConfirmation(email) {
    try {
      const { data, error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: process.env.CLIENT_URL + '/login'
        }
      });
      
      return { data, error };
    } catch (err) {
      console.error('Resend confirmation error:', err);
      return { data: null, error: err };
    }
  },
  
  // Reset password
  async resetPassword(email) {
    try {
      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: process.env.CLIENT_URL + '/reset-password'
      });
      
      return { data, error };
    } catch (err) {
      console.error('Reset password error:', err);
      return { data: null, error: err };
    }
  },
  // Create a new user
  async createUser(userData) {
    const { data, error } = await supabase
      .from('users')
      .insert([userData])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Get user by email
  async getUserByEmail(email) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  // Get user by ID
  async getUserById(id) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data;
  },

  // Update user
  async updateUser(id, updates) {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
};

module.exports = {
  supabase,
  donationService,
  userService
};
