export default function WhatsAppButton({ phone, businessName }) {
  const openWhatsApp = (company) => {
    console.log('WhatsApp button clicked!', { phone, businessName, company })
    
    if (!phone) {
      console.warn('No phone number provided')
      return
    }

    // ✅ Clean phone (digits only)
    let cleanPhone = phone.replace(/\D/g, '')
    console.log('Cleaned phone:', cleanPhone)

    // ✅ Remove leading 0 (Indian local format)
    if (cleanPhone.startsWith('0')) {
      cleanPhone = cleanPhone.slice(1)
      console.log('Removed leading 0:', cleanPhone)
    }

    // ✅ Remove double country code like 0091
    if (cleanPhone.startsWith('00')) {
      cleanPhone = cleanPhone.slice(2)
      console.log('Removed double country code:', cleanPhone)
    }

    // ✅ Add India code if missing
    if (cleanPhone.length === 10) {
      cleanPhone = '91' + cleanPhone
      console.log('Added India code:', cleanPhone)
    }

    // ❌ Final validation
    if (cleanPhone.length < 11 || cleanPhone.length > 13) {
      console.error('Invalid phone number:', cleanPhone, 'Length:', cleanPhone.length)
      alert('Invalid phone number format')
      return
    }

    // ✅ Company-specific message and portfolio
    const companyConfig = {
      tanglome: {
        name: 'Tanglome',
        portfolio: 'https://tanglome.com/portfolio'
      },
      zeonhub: {
        name: 'ZeonHub',
        portfolio: 'https://www.zeonhub.com/portfolio',
        instagram: 'https://www.instagram.com/zeonhubdigital/'
      }
    }

    const selectedCompany = companyConfig[company]

    // ✅ Message (customize if needed)
    let message = `Hi ${businessName},


I found your business while searching on Google Maps.


Just wanted to check — are you getting enough enquiries online?


I help businesses improve their online presence (website, Google ranking, etc.).


We at ${selectedCompany.name} can help you with:
• Web Development
• App Development
• Ads Campaign
• SEO
• Social Media Handling
• ERP and Billing Softwares


If you're open, I can share a quick idea for your business.


Check out our portfolio: ${selectedCompany.portfolio}`

    // Add Instagram link for ZeonHub
    if (company === 'zeonhub' && selectedCompany.instagram) {
      message += `\n\nFollow us on Instagram: ${selectedCompany.instagram}`
    }

    // ✅ Use wa.me (best practice)
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`

    console.log('Opening WhatsApp:', whatsappUrl)

    // ✅ Open WhatsApp
    window.open(whatsappUrl, '_blank')
  }

  return (
    <div className="whatsapp-btn-container">
      <button 
        onClick={() => openWhatsApp('tanglome')}
        className="whatsapp-btn whatsapp-btn-tanglome"
        title="Contact via Tanglome"
        disabled={!phone}
      >
        💬 Tanglome
      </button>
      <button 
        onClick={() => openWhatsApp('zeonhub')}
        className="whatsapp-btn whatsapp-btn-zeonhub"
        title="Contact via ZeonHub"
        disabled={!phone}
      >
        💬 ZeonHub
      </button>
    </div>
  )
}