require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const Vendor = require('../models/Vendor');
const PurchaseOrder = require('../models/PurchaseOrder');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/invoice-automation');
  console.log('Connected to MongoDB');

  // Clear existing
  await Promise.all([User.deleteMany(), Vendor.deleteMany(), PurchaseOrder.deleteMany()]);

  // Create admin user
  const user = await User.create({ name: 'Admin User', email: 'admin@company.com', password: 'admin123', role: 'admin' });
  console.log('Created user: admin@company.com / admin123');

  // Create vendors
  const vendors = await Vendor.insertMany([
    { name: 'TechSupply Corp', email: 'billing@techsupply.com', phone: '+1-555-0101', taxId: 'TS-2024-001', registrationNumber: 'REG-001', paymentTerms: 'Net 30', address: { street: '100 Tech Ave', city: 'San Francisco', state: 'CA', country: 'USA', zipCode: '94102' } },
    { name: 'Office Essentials Ltd', email: 'invoices@officeessentials.com', phone: '+1-555-0202', taxId: 'OE-2024-002', registrationNumber: 'REG-002', paymentTerms: 'Net 15', address: { street: '200 Office Blvd', city: 'New York', state: 'NY', country: 'USA', zipCode: '10001' } },
    { name: 'Cloud Services Inc', email: 'accounts@cloudservices.io', phone: '+1-555-0303', taxId: 'CS-2024-003', registrationNumber: 'REG-003', paymentTerms: 'Net 60', address: { street: '300 Cloud St', city: 'Austin', state: 'TX', country: 'USA', zipCode: '73301' } }
  ]);
  console.log(`Created ${vendors.length} vendors`);

  // Create purchase orders
  const pos = await PurchaseOrder.insertMany([
    {
      vendor: vendors[0]._id,
      issueDate: new Date('2024-01-15'),
      expectedDelivery: new Date('2024-02-15'),
      lineItems: [
        { description: 'Laptop Computer - Dell XPS 15', quantity: 5, unitPrice: 1500, totalPrice: 7500 },
        { description: 'External Monitor 27"', quantity: 5, unitPrice: 350, totalPrice: 1750 },
        { description: 'USB-C Docking Station', quantity: 5, unitPrice: 150, totalPrice: 750 }
      ],
      subTotal: 10000,
      taxRate: 10,
      tax: 1000,
      totalAmount: 11000,
      currency: 'USD',
      status: 'approved',
      createdBy: user._id
    },
    {
      vendor: vendors[1]._id,
      issueDate: new Date('2024-01-20'),
      expectedDelivery: new Date('2024-02-05'),
      lineItems: [
        { description: 'Office Chair - Ergonomic', quantity: 10, unitPrice: 250, totalPrice: 2500 },
        { description: 'Standing Desk', quantity: 5, unitPrice: 500, totalPrice: 2500 }
      ],
      subTotal: 5000,
      taxRate: 8,
      tax: 400,
      totalAmount: 5400,
      currency: 'USD',
      status: 'approved',
      createdBy: user._id
    },
    {
      vendor: vendors[2]._id,
      issueDate: new Date('2024-02-01'),
      lineItems: [
        { description: 'Cloud Storage - 1TB Annual', quantity: 1, unitPrice: 1200, totalPrice: 1200 },
        { description: 'Security Suite License - Annual', quantity: 20, unitPrice: 50, totalPrice: 1000 }
      ],
      subTotal: 2200,
      taxRate: 0,
      tax: 0,
      totalAmount: 2200,
      currency: 'USD',
      status: 'approved',
      createdBy: user._id
    }
  ]);
  console.log(`Created ${pos.length} purchase orders`);

  await mongoose.disconnect();
  console.log('Seed complete!');
}

seed().catch(console.error);
