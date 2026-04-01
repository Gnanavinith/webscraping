export default function WhatsAppButton({ phone, businessName }) {
  const openWhatsApp = () => {
    if (!phone) {
      console.warn('No phone number provided')
      return
    }

    // ✅ Clean phone (digits only)
    let cleanPhone = phone.replace(/\D/g, '')

    // ✅ Remove leading 0 (Indian local format)
    if (cleanPhone.startsWith('0')) {
      cleanPhone = cleanPhone.slice(1)
    }

    // ✅ Remove double country code like 0091
    if (cleanPhone.startsWith('00')) {
      cleanPhone = cleanPhone.slice(2)
    }

    // ✅ Add India code if missing
    if (cleanPhone.length === 10) {
      cleanPhone = '91' + cleanPhone
    }

    // ❌ Final validation
    if (cleanPhone.length < 11 || cleanPhone.length > 13) {
      console.error('Invalid phone number:', cleanPhone)
      return
    }

    // ✅ Message (customize if needed)
    const message = `Hi ${businessName},


I found your business while searching on Google Maps.


Just wanted to check — are you getting enough enquiries online?


I help businesses improve their online presence (website, Google ranking, etc.).


We at Tanglome can help you with:
• Web Development
• App Development
• Ads Campaign
• SEO
• Social Media Handling
• ERP and Billing Softwares


If you're open, I can share a quick idea for your business.

Check out our portfolio: https://tanglome.com/portfolio`

    // ✅ Use wa.me (best practice)
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`

    console.log('Opening WhatsApp:', whatsappUrl)

    // ✅ Open WhatsApp
    window.open(whatsappUrl, '_blank')
  }

  return (
    <button 
      onClick={openWhatsApp}
      className="whatsapp-btn"
      title="Send WhatsApp message"
      disabled={!phone}
    >
      💬 Contact
    </button>
  )
}