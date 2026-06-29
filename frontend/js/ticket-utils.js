(function exposeTicketUtils(window) {
  const { digitsOnly, normalizeSearchText } = window.AppUtils;

  function isCustomerChatContact(contact) {
    if (contact.source === 'wide_voice') return false;
    if (contact.remoteJid && !contact.remoteJid.endsWith('@s.whatsapp.net')) return false;
    return contact.phone && contact.phone !== '0';
  }

  function getContactLastMessage(messages, contact) {
    const contactPhone = digitsOnly(contact.phone);
    return messages.find((message) => digitsOnly(message.phone) === contactPhone);
  }

  function matchesTicketSearch(contact, ticketSearch, messages) {
    const searchText = normalizeSearchText(ticketSearch);
    if (!searchText) return true;

    const lastMessage = getContactLastMessage(messages, contact);
    const searchableText = normalizeSearchText([
      contact.name,
      contact.phone,
      contact.remoteJid,
      contact.source,
      contact.status,
      lastMessage?.content
    ].filter(Boolean).join(' '));
    const searchDigits = digitsOnly(searchText);

    return searchableText.includes(searchText)
      || Boolean(searchDigits && digitsOnly(`${contact.phone || ''} ${contact.remoteJid || ''}`).includes(searchDigits));
  }

  function getVisibleTicketContacts(contacts, ticketFilter, ticketSearch, messages) {
    const chatContacts = contacts.filter(isCustomerChatContact);
    const filteredContacts = ticketFilter === 'all'
      ? chatContacts
      : chatContacts.filter((contact) => (contact.status || 'open') === ticketFilter);

    return filteredContacts.filter((contact) => matchesTicketSearch(contact, ticketSearch, messages));
  }

  window.TicketUtils = {
    getContactLastMessage,
    getVisibleTicketContacts,
    isCustomerChatContact,
    matchesTicketSearch
  };
})(window);
