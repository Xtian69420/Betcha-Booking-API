const Property = require('../models/propertyModel');
const FAQ = require('../models/faqModel');
const Booking = require('../models/bookingModel');

const sessions = {}; // In-memory sessions keyed by user_<userId>

exports.chatBotFlow = async (req, res) => {
  try {
    const { userId, message } = req.body;
    if (!userId || !message) {
      return res.status(400).json({ reply: "Missing userId or message." });
    }

    const sessionKey = `user_${userId}`;
    const input = message.trim().toLowerCase();

    if (input === 'end') {
      if (sessions[sessionKey]) {
        delete sessions[sessionKey];
        return res.json({ reply: "❌ Your session has been ended. Type anything to start again." });
      } else {
        return res.json({ reply: "ℹ️ No active session found. Type anything to start a new one." });
      }
    }

    if (!sessions[sessionKey]) sessions[sessionKey] = { step: 0 };
    const user = sessions[sessionKey];

    switch (user.step) {
      case 0:
        user.step = 1;
        return res.json({
          reply: `👋 Welcome to Betcha Booking!

Please choose one of the options below:
1️⃣ Calendar for Specific Property  
2️⃣ Frequently Asked Questions  
3️⃣ Property Details

❗ If your question is not covered here, you may create a ticket to talk directly with a support agent.`

        });

      case 1:
        if (["1", "2", "3"].includes(input)) {
          user.choice = parseInt(input);
          if (user.choice === 1 || user.choice === 3) {
            user.step = 2;
            const cities = await Property.distinct("city", { status: 'Active' });
            user.cityList = cities;

            return res.json({
              reply: `📍 Please select a city:\n${cities.map((c, i) => `${i + 1}. ${c}`).join("\n")}`
            });
          } else if (user.choice === 2) {
            const faqs = await FAQ.find().limit(5);
            const formattedFAQs = faqs.map((faq, i) => `${i + 1}. ${faq.question}`).join("\n");
            user.step = 1;
            return res.json({
              reply: `📚 Frequently Asked Questions:\n${formattedFAQs}\n\nType a number to view the answer, or type 'back' to return.`
            });
          }
        } else {
          return res.json({ reply: "⚠️ Please choose a valid option (1, 2, or 3). If your concern has nothing to do with this list, feel free to open a ticket and talk tou our agent" });
        }
        break;

      case 2: {
        const index = parseInt(input) - 1;
        if (isNaN(index) || !user.cityList || !user.cityList[index]) {
          return res.json({ reply: "❌ Invalid city. Please choose a valid number from the list." });
        }
        user.city = user.cityList[index];

        const properties = await Property.find({ city: user.city, status: 'Active' });
        if (!properties.length) return res.json({ reply: `No properties found in ${user.city}.` });

        user.properties = properties;
        user.step = 3;

        return res.json({
          reply: `🏠 Properties in ${user.city}:\n${properties.map((p, i) => `${i + 1}. ${p.name}, ${p.address}`).join("\n")}`
        });
      }

      case 3: {
        const index = parseInt(input) - 1;
        if (!user.properties || !user.properties[index]) {
          return res.json({ reply: "❌ Invalid property selection." });
        }

        const selectedProperty = user.properties[index];
        user.step = 4;

        if (user.choice === 1) {
          const maintenanceDates = selectedProperty.maintenance.flatMap(m => m.dates) || [];
          const bookings = await Booking.find({
            propertyId: selectedProperty._id,
            status: { $nin: ['Cancel'] }
          });

          const bookedDates = bookings.flatMap(b => b.datesOfBooking);
          const allBlocked = [...maintenanceDates, ...bookedDates];

          const formatted = allBlocked.length
            ? allBlocked
                .map(d => new Date(d).toDateString())
                .sort((a, b) => new Date(a) - new Date(b))
                .join("\n")
            : "No unavailable dates found.";

          return res.json({
            reply: `🗓️ Unavailable Dates for ${selectedProperty.name}:\n${formatted}`
          });

        } else {
          return res.json({
            reply: `📍 Details for ${selectedProperty.name}:
📌 Address: ${selectedProperty.address}
🛏️ Max Capacity: ${selectedProperty.maxCapacity}
💸 Package Price: ₱${selectedProperty.packagePrice}
🏷️ Category: ${selectedProperty.category}
⭐ Rating: ${selectedProperty.rating.toFixed(1)} (${selectedProperty.rateCount} reviews)
🌐 Map: ${selectedProperty.mapLink}
📸 Photos: ${selectedProperty.photoLinks.slice(0, 3).join("\n")}

Type 'back' to return to the main menu or 'end' to exit.`
          });
        }
      }

      default:
        if (input === 'back') {
          sessions[sessionKey] = { step: 0 };
          return res.json({ reply: "🔁 Back to main menu. Type anything to start again." });
        }
        return res.json({
        reply: `🤖 I didn’t quite get that. 
        If your question is not listed, feel free to create a ticket to talk to a support agent. 
        Type 'back' to return to the main menu or 'end' to exit.`
        });

    }
  } catch (err) {
    console.error("Chatbot error:", err);
    return res.status(500).json({ reply: "🚨 Something went wrong. Please try again later." });
  }
};
