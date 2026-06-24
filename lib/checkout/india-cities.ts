/**
 * India-first city list for the address City typeahead. Each city maps to its
 * state so selecting a city can auto-fill the State field. Not exhaustive — the
 * City field stays free-text, so any town not listed is still saveable; this
 * just speeds up the common case for an India-first store.
 */

export type IndiaCity = { name: string; state: string };

export const INDIA_CITIES: IndiaCity[] = [
  // Karnataka
  { name: "Bangalore", state: "Karnataka" },
  { name: "Mysore", state: "Karnataka" },
  { name: "Mangalore", state: "Karnataka" },
  { name: "Hubli", state: "Karnataka" },
  { name: "Belgaum", state: "Karnataka" },
  { name: "Gulbarga", state: "Karnataka" },
  { name: "Davanagere", state: "Karnataka" },
  { name: "Shimoga", state: "Karnataka" },
  { name: "Udupi", state: "Karnataka" },
  // Maharashtra
  { name: "Mumbai", state: "Maharashtra" },
  { name: "Pune", state: "Maharashtra" },
  { name: "Nagpur", state: "Maharashtra" },
  { name: "Nashik", state: "Maharashtra" },
  { name: "Aurangabad", state: "Maharashtra" },
  { name: "Thane", state: "Maharashtra" },
  { name: "Navi Mumbai", state: "Maharashtra" },
  { name: "Kolhapur", state: "Maharashtra" },
  { name: "Solapur", state: "Maharashtra" },
  { name: "Nanded", state: "Maharashtra" },
  // Delhi
  { name: "Delhi", state: "Delhi" },
  { name: "New Delhi", state: "Delhi" },
  // Tamil Nadu
  { name: "Chennai", state: "Tamil Nadu" },
  { name: "Coimbatore", state: "Tamil Nadu" },
  { name: "Madurai", state: "Tamil Nadu" },
  { name: "Tiruchirappalli", state: "Tamil Nadu" },
  { name: "Salem", state: "Tamil Nadu" },
  { name: "Tirunelveli", state: "Tamil Nadu" },
  { name: "Tiruppur", state: "Tamil Nadu" },
  { name: "Vellore", state: "Tamil Nadu" },
  { name: "Erode", state: "Tamil Nadu" },
  { name: "Thanjavur", state: "Tamil Nadu" },
  { name: "Kanchipuram", state: "Tamil Nadu" },
  // Telangana
  { name: "Hyderabad", state: "Telangana" },
  { name: "Warangal", state: "Telangana" },
  { name: "Nizamabad", state: "Telangana" },
  { name: "Karimnagar", state: "Telangana" },
  // Andhra Pradesh
  { name: "Visakhapatnam", state: "Andhra Pradesh" },
  { name: "Vijayawada", state: "Andhra Pradesh" },
  { name: "Guntur", state: "Andhra Pradesh" },
  { name: "Nellore", state: "Andhra Pradesh" },
  { name: "Tirupati", state: "Andhra Pradesh" },
  { name: "Rajahmundry", state: "Andhra Pradesh" },
  { name: "Kakinada", state: "Andhra Pradesh" },
  // Kerala
  { name: "Thiruvananthapuram", state: "Kerala" },
  { name: "Kochi", state: "Kerala" },
  { name: "Kozhikode", state: "Kerala" },
  { name: "Thrissur", state: "Kerala" },
  { name: "Kollam", state: "Kerala" },
  { name: "Kannur", state: "Kerala" },
  { name: "Alappuzha", state: "Kerala" },
  // West Bengal
  { name: "Kolkata", state: "West Bengal" },
  { name: "Howrah", state: "West Bengal" },
  { name: "Durgapur", state: "West Bengal" },
  { name: "Asansol", state: "West Bengal" },
  { name: "Siliguri", state: "West Bengal" },
  // Uttar Pradesh
  { name: "Lucknow", state: "Uttar Pradesh" },
  { name: "Kanpur", state: "Uttar Pradesh" },
  { name: "Agra", state: "Uttar Pradesh" },
  { name: "Varanasi", state: "Uttar Pradesh" },
  { name: "Meerut", state: "Uttar Pradesh" },
  { name: "Allahabad", state: "Uttar Pradesh" },
  { name: "Prayagraj", state: "Uttar Pradesh" },
  { name: "Ghaziabad", state: "Uttar Pradesh" },
  { name: "Noida", state: "Uttar Pradesh" },
  { name: "Bareilly", state: "Uttar Pradesh" },
  { name: "Aligarh", state: "Uttar Pradesh" },
  { name: "Gorakhpur", state: "Uttar Pradesh" },
  { name: "Mathura", state: "Uttar Pradesh" },
  // Gujarat
  { name: "Ahmedabad", state: "Gujarat" },
  { name: "Surat", state: "Gujarat" },
  { name: "Vadodara", state: "Gujarat" },
  { name: "Rajkot", state: "Gujarat" },
  { name: "Bhavnagar", state: "Gujarat" },
  { name: "Jamnagar", state: "Gujarat" },
  { name: "Gandhinagar", state: "Gujarat" },
  // Rajasthan
  { name: "Jaipur", state: "Rajasthan" },
  { name: "Jodhpur", state: "Rajasthan" },
  { name: "Udaipur", state: "Rajasthan" },
  { name: "Kota", state: "Rajasthan" },
  { name: "Ajmer", state: "Rajasthan" },
  { name: "Bikaner", state: "Rajasthan" },
  // Madhya Pradesh
  { name: "Indore", state: "Madhya Pradesh" },
  { name: "Bhopal", state: "Madhya Pradesh" },
  { name: "Jabalpur", state: "Madhya Pradesh" },
  { name: "Gwalior", state: "Madhya Pradesh" },
  { name: "Ujjain", state: "Madhya Pradesh" },
  // Punjab
  { name: "Ludhiana", state: "Punjab" },
  { name: "Amritsar", state: "Punjab" },
  { name: "Jalandhar", state: "Punjab" },
  { name: "Patiala", state: "Punjab" },
  { name: "Mohali", state: "Punjab" },
  // Haryana
  { name: "Gurgaon", state: "Haryana" },
  { name: "Gurugram", state: "Haryana" },
  { name: "Faridabad", state: "Haryana" },
  { name: "Panipat", state: "Haryana" },
  { name: "Ambala", state: "Haryana" },
  { name: "Karnal", state: "Haryana" },
  // Bihar
  { name: "Patna", state: "Bihar" },
  { name: "Gaya", state: "Bihar" },
  { name: "Bhagalpur", state: "Bihar" },
  { name: "Muzaffarpur", state: "Bihar" },
  // Odisha
  { name: "Bhubaneswar", state: "Odisha" },
  { name: "Cuttack", state: "Odisha" },
  { name: "Rourkela", state: "Odisha" },
  { name: "Puri", state: "Odisha" },
  // Assam
  { name: "Guwahati", state: "Assam" },
  { name: "Silchar", state: "Assam" },
  { name: "Dibrugarh", state: "Assam" },
  // Jharkhand
  { name: "Ranchi", state: "Jharkhand" },
  { name: "Jamshedpur", state: "Jharkhand" },
  { name: "Dhanbad", state: "Jharkhand" },
  // Chhattisgarh
  { name: "Raipur", state: "Chhattisgarh" },
  { name: "Bhilai", state: "Chhattisgarh" },
  { name: "Bilaspur", state: "Chhattisgarh" },
  // Uttarakhand
  { name: "Dehradun", state: "Uttarakhand" },
  { name: "Haridwar", state: "Uttarakhand" },
  { name: "Rishikesh", state: "Uttarakhand" },
  // Himachal Pradesh
  { name: "Shimla", state: "Himachal Pradesh" },
  { name: "Manali", state: "Himachal Pradesh" },
  // Goa
  { name: "Panaji", state: "Goa" },
  { name: "Margao", state: "Goa" },
  { name: "Vasco da Gama", state: "Goa" },
  // Jammu & Kashmir / Chandigarh / Puducherry
  { name: "Srinagar", state: "Jammu and Kashmir" },
  { name: "Jammu", state: "Jammu and Kashmir" },
  { name: "Chandigarh", state: "Chandigarh" },
  { name: "Puducherry", state: "Puducherry" },
];
