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
              <td className="td-name" data-label="Business">
                {biz.name || <span className="no-data">—</span>}
              </td>
              <td className="td-addr" data-label="Address">
                {biz.address ? biz.address : <span className="no-data">—</span>}
              </td>
              <td className="td-phone" data-label="Phone">
                {biz.phone ? biz.phone : <span className="no-data">—</span>}
              </td>
              <td className="td-rating" data-label="Rating">
                {biz.rating ? `★ ${biz.rating}` : <span className="no-data">—</span>}
              </td>
              <td className="td-reviews" data-label="Reviews">
                {biz.reviews ? biz.reviews : <span className="no-data">—</span>}
              </td>
              <td className="td-action" data-label="Contact">
                {biz.phone ? (
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