import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  profilesTable,
  kycDocumentsTable,
  seedListingsTable,
  bartarListingsTable,
  escrowTransactionsTable,
  ledgerEntriesTable,
  shipmentsTable,
  messagesTable,
  tradeContractsTable,
  notificationsTable,
  aiDiagnosticLogsTable,
  adminActionLogsTable,
  webhookEventsTable,
  logisticsProvidersTable,
  educationalContentTable,
  reviewsTable,
  cartItemsTable,
  negotiationsTable,
} from "@workspace/db";
import { hashPassword, hashPin, generateVerificationCode } from "../server/src/lib/crypto";
import { calculateEscrowBreakdown, buildDepositLedgerEntries } from "../server/src/lib/financial";

async function seed() {
  console.log("🌱 Seeding database...\n");

  // ── 1. USERS ──────────────────────────────────────────────────────────────────
  const existingAdmin = await db.select().from(usersTable).where(eq(usersTable.phone, "+2348000000000")).limit(1);
  let adminId = existingAdmin[0]?.id;
  if (!adminId) {
    console.log("❌ Admin user not found. Run the admin creation script first.");
    return;
  }
  console.log(`✓ Admin user: ${adminId}`);

  const testUsers = [
    { phone: "+2348011111111", role: "FARMER",  firstName: "Chidi",  lastName: "Okonkwo",  businessName: "Chidi Farms",      state: "Enugu" },
    { phone: "+2348022222222", role: "TRADER",  firstName: "Aminat", lastName: "Bello",    businessName: "Bello Trading",    state: "Kano" },
    { phone: "+2348033333333", role: "BUYER",   firstName: "Tunde",  lastName: "Ogunlade", businessName: null,               state: "Lagos" },
    { phone: "+2348044444444", role: "SELLER",  firstName: "Nkechi", lastName: "Eze",      businessName: "Eze Agro Supplies", state: "Abia" },
    { phone: "+2348055555555", role: "FARMER",  firstName: "Yusuf",  lastName: "Abubakar", businessName: "Yusuf Farms",       state: "Kaduna" },
  ];

  const userIds: Record<string, string> = { admin: adminId };

  for (const u of testUsers) {
    const existing = await db.select().from(usersTable).where(eq(usersTable.phone, u.phone)).limit(1);
    if (existing[0]) {
      userIds[u.firstName] = existing[0].id;
      continue;
    }
    const pwHash = await hashPassword("Test@1234");
    const [user] = await db.insert(usersTable).values({
      phone: u.phone,
      passwordHash: pwHash,
      role: u.role,
      isActive: true,
      kycStatus: u.role === "FARMER" ? "VERIFIED" : "UNVERIFIED",
    }).returning();
    if (!user) throw new Error("User creation failed");
    userIds[u.firstName] = user.id;

    await db.insert(profilesTable).values({
      userId: user.id,
      firstName: u.firstName,
      lastName: u.lastName,
      businessName: u.businessName,
      state: u.state,
      country: "Nigeria",
    });

    // Set transaction PIN for buyers/sellers
    if (u.role === "BUYER" || u.role === "SELLER" || u.role === "TRADER") {
      const pinHash = await hashPin("1234");
      await db.update(usersTable).set({ transactionPinHash: pinHash }).where(eq(usersTable.id, user.id));
    }
  }

  // Also create a dedicated logistics user
  const existingLogistics = await db.select().from(usersTable).where(eq(usersTable.phone, "+2348066666666")).limit(1);
  let logisticsUserId = existingLogistics[0]?.id;
  if (!logisticsUserId) {
    const pwHash = await hashPassword("Test@1234");
    const [logUser] = await db.insert(usersTable).values({
      phone: "+2348066666666",
      passwordHash: pwHash,
      role: "FARMER",
      isActive: true,
    }).returning();
    if (!logUser) throw new Error("Logistics user creation failed");
    logisticsUserId = logUser.id;
    userIds["Logistics"] = logisticsUserId;

    await db.insert(profilesTable).values({
      userId: logUser.id,
      firstName: "Emeka",
      lastName: "Okafor",
      businessName: "Okafor Logistics",
      state: "Lagos",
      country: "Nigeria",
    });
  } else {
    userIds["Logistics"] = logisticsUserId;
  }

  console.log("✓ 5 test users + 1 logistics user created (or already exist)");
  console.log(`  Farmer: ${userIds["Chidi"]}, Trader: ${userIds["Aminat"]}, Buyer: ${userIds["Tunde"]}, Seller: ${userIds["Nkechi"]}, Farmer2: ${userIds["Yusuf"]}`);

  // ── 2. KYC DOCUMENTS ─────────────────────────────────────────────────────────
  const existingKyc = await db.select().from(kycDocumentsTable).limit(1);
  if (existingKyc.length === 0) {
    await db.insert(kycDocumentsTable).values({
      userId: userIds["Chidi"],
      cacNumber: "CAC-12345-ABCD",
      governmentIdUrl: "https://example.com/id-chidi.pdf",
      status: "APPROVED",
      submittedAt: new Date(),
      reviewedById: adminId,
      reviewedAt: new Date(),
    });
    // PENDING KYC for admin review
    await db.insert(kycDocumentsTable).values({
      userId: userIds["Yusuf"],
      cacNumber: "CAC-67890-EFGH",
      governmentIdUrl: "https://example.com/id-yusuf.pdf",
      status: "PENDING",
      submittedAt: new Date(),
    });
    console.log("✓ KYC documents seeded (1 approved, 1 pending)");
  } else {
    console.log("✓ KYC documents already exist");
  }

  // ── 3. SEED LISTINGS ─────────────────────────────────────────────────────────
  let seedListingIds: string[] = [];
  const existingSeeds = await db.select().from(seedListingsTable).limit(1);
  if (existingSeeds.length === 0) {
    const listings = [
      { sellerId: userIds["Chidi"], title: "Premium Maize Seeds",  desc: "High-yield hybrid maize seeds, drought-resistant.",                  price: 4500, qty: 500,  unit: "kg",       cat: "Grains",      lat: 6.4478, lng: 7.4908, state: "Enugu" },
      { sellerId: userIds["Nkechi"], title: "Organic Cassava Cuttings", desc: "Disease-free certified organic cassava stems.",                  price: 2500, qty: 1000, unit: "bundles",  cat: "Tubers",     lat: 5.4500, lng: 7.5000, state: "Abia" },
      { sellerId: userIds["Chidi"], title: "Tomato Seedlings",    desc: "Fresh Roma tomato seedlings ready for transplant.",                  price: 800,  qty: 200,  unit: "trays",    cat: "Vegetables", lat: 6.4500, lng: 7.5000, state: "Enugu" },
      { sellerId: userIds["Yusuf"], title: "Sorghum Grains",      desc: "White sorghum grains for animal feed and brewing.",                   price: 3200, qty: 800,  unit: "kg",       cat: "Grains",      lat: 10.5000, lng: 7.4333, state: "Kaduna" },
    ];
    for (const l of listings) {
      const ids = crypto.randomUUID();
      seedListingIds.push(ids);
      await db.insert(seedListingsTable).values({
        id: ids,
        sellerId: l.sellerId,
        title: l.title,
        description: l.desc,
        price: l.price.toFixed(2),
        currency: "NGN",
        quantity: l.qty.toFixed(4),
        unit: l.unit,
        category: l.cat,
        latitude: l.lat,
        longitude: l.lng,
        state: l.state,
        status: "ACTIVE",
        viewCount: Math.floor(Math.random() * 500),
        imageUrls: [],
      });
    }
    console.log("✓ 4 seed listings created");
  } else {
    seedListingIds = existingSeeds.map((s) => s.id);
    console.log("✓ Seed listings already exist");
  }

  // ── 4. BARTAR LISTINGS ───────────────────────────────────────────────────────
  let bartarListingIds: string[] = [];
  const existingBartar = await db.select().from(bartarListingsTable).limit(1);
  if (existingBartar.length === 0) {
    const bartarListings = [
      { sellerId: userIds["Nkechi"], commodity: "Cocoa Beans",    qty: 10000, unit: "MT",   price: 2500, currency: "USD", grade: "Grade A", origin: "Nigeria" },
      { sellerId: userIds["Yusuf"],  commodity: "Cashew Nuts",   qty: 5000,  unit: "MT",   price: 1800, currency: "USD", grade: "Grade B", origin: "Nigeria" },
    ];
    for (const l of bartarListings) {
      const ids = crypto.randomUUID();
      bartarListingIds.push(ids);
      await db.insert(bartarListingsTable).values({
        id: ids,
        sellerId: l.sellerId,
        commodity: l.commodity,
        quantity: l.qty.toFixed(4),
        unit: l.unit,
        price: l.price.toFixed(2),
        currency: l.currency,
        qualityGrade: l.grade,
        originCountry: l.origin,
        isVerifiedExporter: "true",
        description: `Premium ${l.commodity} for export. High quality, fair trade certified.`,
      });
    }
    console.log("✓ 2 bartar listings created");
  } else {
    bartarListingIds = existingBartar.map((b) => b.id);
    console.log("✓ Bartar listings already exist");
  }

  // ── 5. ESCROW + LEDGER + SHIPMENT ────────────────────────────────────────────
  const existingEscrow = await db.select().from(escrowTransactionsTable).limit(1);
  if (existingEscrow.length === 0 && seedListingIds[0]) {
    const amount = 4500;
    const breakdown = calculateEscrowBreakdown(amount, false);

    const [escrow] = await db.insert(escrowTransactionsTable).values({
      platform: "SEED",
      listingId: seedListingIds[0],
      buyerId: userIds["Tunde"],
      sellerId: userIds["Chidi"],
      amount: amount.toFixed(2),
      currency: "NGN",
      platformCommissionRate: breakdown.platformCommissionRate,
      platformCommission: breakdown.platformCommission,
      logisticsFee: breakdown.logisticsFee,
      insuranceFee: breakdown.insuranceFee,
      netSellerPayout: breakdown.netSellerPayout,
      status: "FUNDS_HELD",
      paymentReference: "SEED-REF-001",
      paymentProvider: "DEMO",
      depositedAt: new Date(),
    }).returning();

    if (escrow) {
      const entries = buildDepositLedgerEntries(escrow.id, breakdown, "NGN");
      await db.insert(ledgerEntriesTable).values(entries);

      const vc = generateVerificationCode(8);
      await db.insert(shipmentsTable).values({
        escrowId: escrow.id,
        status: "PICKED_UP",
        verificationCode: vc,
        trackingCode: "BIA-TRK-001",
        originAddress: "Chidi Farms, Enugu State",
        destinationAddress: "Tunde's Warehouse, Lagos",
        pickedUpAt: new Date(),
      });

      // Trade contract for this escrow
      await db.insert(tradeContractsTable).values({
        escrowId: escrow.id,
        contentHash: crypto.createHash("sha256").update("seed-contract-001").digest("hex"),
        contentUrl: "/contracts/seed-contract-001.html",
        terms: "Sale of 1 kg Premium Maize Seeds at NGN 4,500. Payment via escrow. Delivery within 7 days.",
        signedByBuyer: true,
        signedBySeller: false,
        buyerSignedAt: new Date(),
        generatedById: adminId,
      });

      console.log(`✓ Escrow, ledger entries, shipment, and contract created (escrow: ${escrow.id})`);
      console.log(`  Verification code for delivery: ${vc}`);
    }
  } else {
    console.log("✓ Escrow already exists");
  }

  // ── 6. MESSAGES ──────────────────────────────────────────────────────────────
  const existingMessages = await db.select().from(messagesTable).limit(1);
  if (existingMessages.length === 0) {
    await db.insert(messagesTable).values({
      tradeId: null,
      senderId: userIds["Tunde"],
      receiverId: userIds["Chidi"],
      content: "Hi, is the maize still available? I'm interested in purchasing.",
    });
    await db.insert(messagesTable).values({
      tradeId: null,
      senderId: userIds["Chidi"],
      receiverId: userIds["Tunde"],
      content: "Yes, plenty in stock. When would you like to arrange pickup?",
    });
    await db.insert(messagesTable).values({
      tradeId: null,
      senderId: userIds["Nkechi"],
      receiverId: userIds["Yusuf"],
      content: "We have fresh cocoa beans available for export. Interested?",
    });
    console.log("✓ 3 messages created");
  } else {
    console.log("✓ Messages already exist");
  }

  // ── 7. NOTIFICATIONS ─────────────────────────────────────────────────────────
  const existingNotifications = await db.select().from(notificationsTable).limit(1);
  if (existingNotifications.length === 0) {
    await db.insert(notificationsTable).values({
      userId: userIds["Chidi"],
      title: "New Order",
      body: "Tunde Ogunlade has placed an order for your Premium Maize Seeds.",
      type: "ORDER",
      entityType: "escrow",
    });
    await db.insert(notificationsTable).values({
      userId: userIds["Tunde"],
      title: "Payment Confirmed",
      body: "Your payment for Premium Maize Seeds has been received. Funds held in escrow.",
      type: "PAYMENT",
      entityType: "escrow",
    });
    await db.insert(notificationsTable).values({
      userId: userIds["Aminat"],
      title: "Welcome to Bia'net",
      body: "Thank you for joining Bia'net. Start exploring trades today!",
      type: "SYSTEM",
    });
    console.log("✓ 3 notifications created");
  } else {
    console.log("✓ Notifications already exist");
  }

  // ── 8. AI DIAGNOSTIC LOG ─────────────────────────────────────────────────────
  const existingAi = await db.select().from(aiDiagnosticLogsTable).limit(1);
  if (existingAi.length === 0) {
    await db.insert(aiDiagnosticLogsTable).values({
      userId: userIds["Chidi"],
      imageUrl: "https://example.com/cassava-leaf.jpg",
      diseaseName: "Cassava Mosaic Disease",
      confidence: 0.94,
      isHealthy: "false",
      treatmentOrganic: "Remove infected plants, use resistant varieties, apply neem oil spray.",
      treatmentChemical: "Apply imidacloprid insecticide at first sign of whiteflies.",
      language: "en",
      cropType: "Cassava",
    });
    console.log("✓ 1 AI diagnostic log created");
  } else {
    console.log("✓ AI diagnostic logs already exist");
  }

  // ── 9. ADMIN ACTION LOGS ─────────────────────────────────────────────────────
  const existingLogs = await db.select().from(adminActionLogsTable).limit(1);
  if (existingLogs.length === 0) {
    await db.insert(adminActionLogsTable).values({
      adminId,
      action: "KYC_APPROVED",
      entityType: "kyc_document",
      entityId: crypto.randomUUID(),
      result: "SUCCESS",
      notes: "Approved Chidi Okonkwo's KYC submission. CAC verified.",
      ipAddress: "127.0.0.1",
    });
    await db.insert(adminActionLogsTable).values({
      adminId,
      action: "LOGIN",
      entityType: null,
      entityId: null,
      result: "SUCCESS",
      notes: "Admin login from Lagos, Nigeria.",
      ipAddress: "127.0.0.1",
    });
    console.log("✓ 2 admin action logs created");
  } else {
    console.log("✓ Admin action logs already exist");
  }

  // ── 10. WEBHOOK EVENTS ───────────────────────────────────────────────────────
  const existingWebhooks = await db.select().from(webhookEventsTable).limit(1);
  if (existingWebhooks.length === 0) {
    await db.insert(webhookEventsTable).values({
      provider: "PAYSTACK",
      eventType: "charge.success",
      eventId: "payst-1101",
      payload: { id: "payst-1101", status: "success", amount: 450000, reference: "SEED-REF-001" },
      signatureValid: "true",
      processed: "true",
      processedAt: new Date(),
    });
    console.log("✓ 1 webhook event created");
  } else {
    console.log("✓ Webhook events already exist");
  }

  // ── 11. LOGISTICS PROVIDER ───────────────────────────────────────────────────
  const existingLogisticsProv = await db.select().from(logisticsProvidersTable).limit(1);
  if (existingLogisticsProv.length === 0) {
    await db.insert(logisticsProvidersTable).values({
      userId: logisticsUserId,
      companyName: "Okafor Logistics Ltd",
      registrationNumber: "RC-98765",
      fleetSize: 15,
      coverageStates: ["Lagos", "Ogun", "Oyo", "Enugu", "Abia", "Kano", "Kaduna"],
      phone: "+2348066666666",
      email: "emeka@okaforlogistics.ng",
      isVerified: true,
    });
    console.log("✓ 1 logistics provider created");
  } else {
    console.log("✓ Logistics provider already exists");
  }

  // ── 12. EDUCATIONAL CONTENT ──────────────────────────────────────────────────
  const existingEdu = await db.select().from(educationalContentTable).limit(1);
  if (existingEdu.length === 0) {
    await db.insert(educationalContentTable).values({
      title: "Best Practices for Cassava Farming",
      description: "A comprehensive guide to growing cassava: soil preparation, planting, pest control, and harvesting techniques for maximum yield.",
      contentType: "ARTICLE",
      contentUrl: "https://example.com/guides/cassava-farming",
      category: "Crop Production",
      language: "en",
      tags: ["cassava", "farming", "best-practices", "nigeria"],
      authorId: adminId,
      isPublished: true,
      publishedAt: new Date(),
    });
    await db.insert(educationalContentTable).values({
      title: "Understanding Export Documentation",
      description: "Learn about the essential documents required for agricultural export: phytosanitary certificates, bills of lading, and letters of credit.",
      contentType: "VIDEO",
      contentUrl: "https://example.com/videos/export-docs",
      category: "Export",
      language: "en",
      tags: ["export", "documentation", "trade"],
      authorId: adminId,
      isPublished: true,
      publishedAt: new Date(),
    });
    console.log("✓ 2 educational content items created");
  } else {
    console.log("✓ Educational content already exists");
  }

  // ── 13. REVIEWS ──────────────────────────────────────────────────────────────
  const existingReviews = await db.select().from(reviewsTable).limit(1);
  if (existingReviews.length === 0 && seedListingIds[0]) {
    await db.insert(reviewsTable).values({
      listingId: seedListingIds[0],
      reviewerId: userIds["Tunde"],
      rating: 5,
      comment: "Excellent quality maize seeds. Germination rate was over 95%!",
    });
    if (seedListingIds[1]) {
      await db.insert(reviewsTable).values({
        listingId: seedListingIds[1],
        reviewerId: userIds["Aminat"],
        rating: 4,
        comment: "Good cassava cuttings, well packaged. Would buy again.",
      });
    }
    console.log("✓ 2 reviews created");
  } else {
    console.log("✓ Reviews already exist");
  }

  // ── 14. CART ITEMS ───────────────────────────────────────────────────────────
  const existingCart = await db.select().from(cartItemsTable).limit(1);
  if (existingCart.length === 0 && seedListingIds.length >= 2) {
    await db.insert(cartItemsTable).values({
      userId: userIds["Aminat"],
      listingId: seedListingIds[0],
      quantity: 3,
    });
    await db.insert(cartItemsTable).values({
      userId: userIds["Aminat"],
      listingId: seedListingIds[1],
      quantity: 5,
    });
    console.log("✓ 2 cart items created (for Aminat)");
  } else {
    console.log("✓ Cart items already exist");
  }

  // ── 15. NEGOTIATIONS ─────────────────────────────────────────────────────────
  const existingNegotiations = await db.select().from(negotiationsTable).limit(1);
  if (existingNegotiations.length === 0 && bartarListingIds[0]) {
    await db.insert(negotiationsTable).values({
      listingId: bartarListingIds[0],
      initiatorId: userIds["Aminat"],
      targetId: userIds["Nkechi"],
      offeredPrice: 2400,
      offeredQuantity: 5000,
      message: "Interested in 5,000 MT of cocoa beans at $2,400/MT. Can arrange shipping.",
      status: "PENDING",
    });
    console.log("✓ 1 negotiation created");
  } else {
    console.log("✓ Negotiations already exist");
  }

  console.log("\n✅ Seeding complete!");
  console.log("\n📋 Test credentials:");
  console.log("   Admin:      +2348000000000 / password123");
  console.log("   All others: +23480XXXXXXX / Test@1234 (PIN: 1234)");
  console.log("\n   Farmers:  Chidi (+2348011111111), Yusuf (+2348055555555)");
  console.log("   Trader:   Aminat (+2348022222222)");
  console.log("   Buyer:    Tunde (+2348033333333)");
  console.log("   Seller:   Nkechi (+2348044444444)");
  console.log("   Logistics: Emeka (+2348066666666)");
}

seed().catch((err) => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
