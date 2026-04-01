import WhatsAppButton from './WhatsAppButton'

export default function ResultsTable({ results }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Business name</th>
            <th>Address</th>
            <th>Phone</th>
            <th>Rating</th>
            <th>Reviews</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {results.map((biz, i) => (
            <tr key={i}>
              <td className="td-name">{biz.name || <span className="no-data">—</span>}</td>
              <td className="td-addr">{biz.address !== 'N/A' ? biz.address : <span className="no-data">—</span>}</td>
              <td className="td-phone">{biz.phone !== 'No phone' ? biz.phone : <span className="no-data">—</span>}</td>
              <td className="td-rating">{biz.rating !== 'N/A' ? biz.rating : <span className="no-data">—</span>}</td>
              <td className="td-reviews">{biz.reviews !== 'N/A' ? biz.reviews : <span className="no-data">—</span>}</td>
              <td className="td-action">
                {biz.phone !== 'No phone' ? (
                  <WhatsAppButton 
                    phone={biz.phone} 
                    businessName={biz.name || 'Business Owner'} 
                  />
                ) : (
                  <span className="no-phone-msg">No phone</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
