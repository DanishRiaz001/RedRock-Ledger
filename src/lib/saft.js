import { MVA_CODES } from "./utils.js";

// SAF-T Financial (Norwegian, v1.3) export — kept in its own module (no React
// imports) so scripts/validate-saft.mjs can import and XSD-validate it.

const xmlEsc=s=>String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
const balAtDate=(transactions,code,onOrBefore)=>transactions.reduce((s,t)=>{
  if(t.date>onOrBefore)return s;
  if(t.debitCode===code)return s+t.amount;
  if(t.creditCode===code)return s-t.amount;
  return s;
},0);
// A day before `from` — SAF-T's "opening balance" is everything posted
// strictly before the export period starts.
const dayBefore=iso=>{const d=new Date(iso+"T00:00:00");d.setDate(d.getDate()-1);return d.toISOString().slice(0,10);};

// Norwegian SAF-T Financial v1.3 export. Conforms to the actual
// Norwegian_SAF-T_Financial_Schema_v_1.30.xsd (Skatteetaten) — element names,
// order, text-length limits and required elements all follow the XSD, and the
// output is validated with `xmllint --schema` (npm run validate-saft) against
// a real Tripletex export of the same shape.
//
// Known best-effort areas (XSD-valid, but an accountant should still review):
//  - GroupingCode uses the account's mapped Skatteetaten SAF-T standard
//    account (saftCode13); unmapped accounts fall back to the 2-digit prefix.
//  - Company address is split from one free-text field.
//  - Amounts are positive with the sign on Debit/Credit; a stored negative
//    amount is abs()'d. Foreign currency: Amount is NOK, CurrencyCode +
//    CurrencyAmount carry the original.
export function buildSAFTXml({accounts,contacts,transactions,companyProfile,dateFrom,dateTo,userEmail,projects=[]}){
  const NS="urn:StandardAuditFile-Taxation-Financial:NO";
  const now=new Date();

  // --- text helpers: escape + clip to the XSD's maxLength for each SAF type
  const clip=(s,n)=>{s=String(s==null?"":s);return s.length>n?s.slice(0,n):s;};
  const t9=s=>xmlEsc(clip(s,9));
  const t18=s=>xmlEsc(clip(s,18));
  const t35=s=>xmlEsc(clip(s,35));
  const t70=s=>xmlEsc(clip(s,70));
  const t256=s=>xmlEsc(clip(s,256));
  const money=n=>{const v=Math.round((Number(n)||0)*100)/100;return(v===0?0:v).toFixed(2);};

  const cp=companyProfile||{};
  const orgNumber=clip(cp.orgNumber||"",35).replace(/\s/g,"");
  const companyName=cp.companyName||"";
  const coPhone=cp.phone||"";
  const coBank=String(cp.bankAccount||"").replace(/\s/g,"");
  // "Street 12, 0123 Oslo" -> street / 0123 / Oslo  (Norwegian 4-digit postcode)
  const splitAddr=raw=>{const m=String(raw||"").match(/^(.*?),?\s*(\d{4})\s+(.+)$/);return m?{street:m[1].trim(),post:m[2],city:m[3].trim()}:{street:String(raw||""),post:"",city:""};};
  const co=splitAddr(cp.address||"");
  const coStreet=co.street,coPost=co.post,coCity=co.city;

  const inPeriod=t=>t.date>=dateFrom&&t.date<=dateTo;
  const periodTxns=transactions.filter(inPeriod);
  const openingCutoff=dayBefore(dateFrom);

  const addressXml=(street,post,city,ind)=>{
    if(!street&&!post&&!city)return"";
    return`\n${ind}<Address>`+
      `\n${ind}  <StreetName>${t256(street||"")}</StreetName>`+
      (city?`\n${ind}  <City>${t256(city)}</City>`:"")+
      (post?`\n${ind}  <PostalCode>${t70(post)}</PostalCode>`:"")+
      `\n${ind}  <Country>NO</Country>`+
      `\n${ind}</Address>`;
  };

  // --- MasterFiles > GeneralLedgerAccounts
  // GroupingCategory names the reference chart; GroupingCode is this account's
  // slot in it — the app already maps each account to a Skatteetaten SAF-T
  // standard account (`saftCode13`), so use that; fall back to the 2-digit
  // kontogruppe prefix when an account isn't mapped.
  const CLASS_LABEL={1:"Eiendeler",2:"Egenkapital og gjeld",3:"Salgs- og driftsinntekt",4:"Varekostnad",5:"Lonnskostnad",6:"Annen driftskostnad",7:"Annen driftskostnad",8:"Finansinntekt og finanskostnad"};
  const glAccountsXml=accounts.map(a=>{
    const code=String(a.code||"");
    const opening=balAtDate(transactions,a.code,openingCutoff);
    const closing=balAtDate(transactions,a.code,dateTo);
    const openTag=opening>=0?`<OpeningDebitBalance>${money(opening)}</OpeningDebitBalance>`:`<OpeningCreditBalance>${money(-opening)}</OpeningCreditBalance>`;
    const closeTag=closing>=0?`<ClosingDebitBalance>${money(closing)}</ClosingDebitBalance>`:`<ClosingCreditBalance>${money(-closing)}</ClosingCreditBalance>`;
    const grpCode=(a.saftCode13&&/^[0-9anAN]{1,20}$/.test(a.saftCode13))?a.saftCode13:(code.slice(0,2)||code);
    const grpCat=a.saftCode13?"Standard Norwegian SAF-T account":(CLASS_LABEL[code[0]]||"Andre kontoer");
    return`        <Account>
          <AccountID>${t70(code)}</AccountID>
          <AccountDescription>${t256(a.name||code)}</AccountDescription>
          <GroupingCategory>${t256(grpCat)}</GroupingCategory>
          <GroupingCode>${t35(grpCode)}</GroupingCode>
          <AccountType>GL</AccountType>
          ${openTag}
          ${closeTag}
        </Account>`;
  }).join("\n");

  // --- per-contact reskontro balance on a control account (signed toward debit)
  const contactBal=(contactId,acctCode,onOrBefore)=>transactions.reduce((s,t)=>{
    if(t.date>onOrBefore)return s;
    if(String(t.contactId||"")!==String(contactId))return s;
    if(t.debitCode===acctCode)return s+Math.abs(t.amount||0);
    if(t.creditCode===acctCode)return s-Math.abs(t.amount||0);
    return s;
  },0);

  const partyXml=(c,kind)=>{
    const isSup=kind==="supplier";
    const acct=isSup?"2400":"1500";
    const open=contactBal(c.id,acct,openingCutoff);
    const close=contactBal(c.id,acct,dateTo);
    const bAcct=`\n          <BalanceAccount>`+
      `\n            <AccountID>${acct}</AccountID>`+
      (open>=0?`\n            <OpeningDebitBalance>${money(open)}</OpeningDebitBalance>`:`\n            <OpeningCreditBalance>${money(-open)}</OpeningCreditBalance>`)+
      (close>=0?`\n            <ClosingDebitBalance>${money(close)}</ClosingDebitBalance>`:`\n            <ClosingCreditBalance>${money(-close)}</ClosingCreditBalance>`)+
      `\n          </BalanceAccount>`;
    const cOrg=String(c.orgNumber||"").replace(/\s/g,"");
    const ca=splitAddr(c.address||"");
    return`        <${isSup?"Supplier":"Customer"}>`+
      (cOrg?`\n          <RegistrationNumber>${t35(cOrg)}</RegistrationNumber>`:"")+
      `\n          <Name>${t256(c.name||c.id)}</Name>`+
      addressXml(ca.street,ca.post,ca.city,"          ")+
      (cOrg?`\n          <TaxRegistration>\n            <TaxRegistrationNumber>${t35("NO"+cOrg+"MVA")}</TaxRegistrationNumber>\n          </TaxRegistration>`:"")+
      `\n          <${isSup?"SupplierID":"CustomerID"}>${t35(c.id)}</${isSup?"SupplierID":"CustomerID"}>`+
      bAcct+
      `\n          <PartyInfo>`+
      `\n            <Type>${c.isCompany===false?"Private":"Company"}</Type>`+
      `\n            <Status>${c.inactive?"Passive":"Active"}</Status>`+
      `\n          </PartyInfo>`+
      `\n        </${isSup?"Supplier":"Customer"}>`;
  };
  const customersXml=contacts.filter(c=>c.type==="customer").map(c=>partyXml(c,"customer")).join("\n");
  const suppliersXml=contacts.filter(c=>c.type==="supplier").map(c=>partyXml(c,"supplier")).join("\n");

  // --- MasterFiles > TaxTable  (one entry, many TaxCodeDetails)
  const seenTax=new Set();
  const taxCodeDetailsXml=MVA_CODES.filter(c=>{
    const code=String(c.code||"");
    if(!/^[0-9anAN]{1,2}$/.test(code))return false; // StandardTaxCode pattern
    if(seenTax.has(code))return false;
    seenTax.add(code);return true;
  }).map(c=>`          <TaxCodeDetails>
            <TaxCode>${t70(c.code)}</TaxCode>
            <Description>${t256(c.name||("MVA "+c.code))}</Description>
            <TaxPercentage>${String(c.rate!=null?c.rate:0)}</TaxPercentage>
            <Country>NO</Country>
            <StandardTaxCode>${xmlEsc(String(c.code))}</StandardTaxCode>
            <BaseRate>100</BaseRate>
          </TaxCodeDetails>`).join("\n");

  // --- GeneralLedgerEntries
  const byBilag=new Map();
  periodTxns.forEach(t=>{
    if(!byBilag.has(t.bilag))byBilag.set(t.bilag,[]);
    byBilag.get(t.bilag).push(t);
  });
  let totalDebit=0,totalCredit=0,numberOfEntries=0;

  const taxInfoFor=(t,sideWanted)=>{
    // Emit <TaxInformation> on the line whose side matches the VAT direction:
    // input VAT sits on the debit (expense) line, output VAT on the credit
    // (income) line. Amount + base come from the transaction's own vat fields.
    if(!t.vatCode||t.vatAmount==null||!t.vatAmount)return"";
    const vc=MVA_CODES.find(c=>String(c.code)===String(t.vatCode));
    const dir=vc?vc.direction:(sideWanted==="debit"?"input":"output");
    if(dir!==(sideWanted==="debit"?"input":"output"))return"";
    // On a split entry the P&L row's amount is already net; otherwise net = gross − VAT.
    const base=t.vatSplit?Math.abs(t.amount||0):Math.abs(t.amount||0)-Math.abs(t.vatAmount||0);
    const amtTag=sideWanted==="debit"
      ?`<DebitTaxAmount><Amount>${money(Math.abs(t.vatAmount))}</Amount></DebitTaxAmount>`
      :`<CreditTaxAmount><Amount>${money(Math.abs(t.vatAmount))}</Amount></CreditTaxAmount>`;
    return`
            <TaxInformation>
              <TaxType>MVA</TaxType>
              <TaxCode>${t70(t.vatCode)}</TaxCode>
              ${t.vatPct!=null?`<TaxPercentage>${String(t.vatPct)}</TaxPercentage>`:""}
              <Country>NO</Country>
              <TaxBase>${money(base)}</TaxBase>
              ${amtTag}
            </TaxInformation>`;
  };

  const projById={};projects.forEach(p=>{projById[p.id]=p;});
  const line=(recordId,code,side,amt,desc,contactId,invoiceNo,dueDate,valueDate,taxInfo,fx,projectId)=>{
    const cust=side==="debit"&&code==="1500"&&contactId?`\n            <CustomerID>${t35(contactId)}</CustomerID>`:"";
    const sup=side==="credit"&&code==="2400"&&contactId?`\n            <SupplierID>${t35(contactId)}</SupplierID>`:"";
    const proj=projById[projectId];
    const analysis=proj?`\n            <Analysis>\n              <AnalysisType>P</AnalysisType>\n              <AnalysisID>${t35(proj.number||proj.id)}</AnalysisID>\n            </Analysis>`:"";
    // AmountStructure: Amount (NOK) then optionally CurrencyCode + CurrencyAmount.
    const curEls=(fx&&fx.currency&&fx.currency!=="NOK"&&fx.currencyAmount)
      ?`\n              <CurrencyCode>${t9(fx.currency)}</CurrencyCode>\n              <CurrencyAmount>${money(Math.abs(fx.currencyAmount))}</CurrencyAmount>`:"";
    const amtEl=side==="debit"
      ?`<DebitAmount>\n              <Amount>${money(amt)}</Amount>${curEls}\n            </DebitAmount>`
      :`<CreditAmount>\n              <Amount>${money(amt)}</Amount>${curEls}\n            </CreditAmount>`;
    return`          <Line>
            <RecordID>${t18(String(recordId))}</RecordID>
            <AccountID>${t70(code)}</AccountID>${analysis}
            <ValueDate>${valueDate}</ValueDate>${cust}${sup}
            <Description>${t256(desc||"")}</Description>
            ${amtEl}${taxInfo||""}${invoiceNo?`\n            <ReferenceNumber>${t35(invoiceNo)}</ReferenceNumber>`:""}${dueDate?`\n            <DueDate>${dueDate}</DueDate>`:""}
          </Line>`;
  };

  const transactionsXml=[...byBilag.entries()].sort((a,b)=>(a[0]||0)-(b[0]||0)).map(([bilag,rows])=>{
    numberOfEntries++;
    const first=rows[0];
    const d=first.date;
    const year=d.slice(0,4),month=parseInt(d.slice(5,7),10);
    let recordId=0;
    const linesXml=[];
    rows.forEach(r=>{
      const amt=Math.abs(r.amount)||0;
      if(r.debitCode){
        recordId++;totalDebit+=amt;
        linesXml.push(line(recordId,r.debitCode,"debit",amt,r.description,r.contactId,r.invoiceNo,r.dueDate,r.date,taxInfoFor(r,"debit"),{currency:r.currency,currencyAmount:r.currencyAmount},r.projectId));
      }
      if(r.creditCode){
        recordId++;totalCredit+=amt;
        linesXml.push(line(recordId,r.creditCode,"credit",amt,r.description,r.contactId,r.invoiceNo,r.dueDate,r.date,taxInfoFor(r,"credit"),{currency:r.currency,currencyAmount:r.currencyAmount},r.projectId));
      }
    });
    return`        <Transaction>
          <TransactionID>${t70(String(bilag))}</TransactionID>
          <Period>${month}</Period>
          <PeriodYear>${year}</PeriodYear>
          <TransactionDate>${d}</TransactionDate>
          <TransactionType>Normal</TransactionType>
          <Description>${t256(first.description||"")}</Description>
          <SystemEntryDate>${d}</SystemEntryDate>
          <GLPostingDate>${d}</GLPostingDate>
          <SystemID>${t18(String(bilag))}</SystemID>
${linesXml.join("\n")}
        </Transaction>`;
  }).join("\n");

  const orgClean=orgNumber;
  return`<?xml version="1.0" encoding="UTF-8"?>
<AuditFile xmlns="${NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${NS} Norwegian_SAF-T_Financial_Schema_v_1.30.xsd">
  <Header>
    <AuditFileVersion>1.30</AuditFileVersion>
    <AuditFileCountry>NO</AuditFileCountry>
    <AuditFileDateCreated>${now.toISOString().slice(0,10)}</AuditFileDateCreated>
    <SoftwareCompanyName>RedRock Ledger</SoftwareCompanyName>
    <SoftwareID>RedRock Ledger</SoftwareID>
    <SoftwareVersion>1.0</SoftwareVersion>
    <Company>
      <RegistrationNumber>${t35(orgClean)}</RegistrationNumber>
      <Name>${t256(companyName||"Company")}</Name>${addressXml(coStreet,coPost,coCity,"      ")}
      <Contact>
        <ContactPerson>
          <FirstName></FirstName>
          <LastName>${t70(companyName||"Contact")}</LastName>
        </ContactPerson>
        ${coPhone?`<Telephone>${t18(coPhone)}</Telephone>`:""}
        ${userEmail?`<Email>${t70(userEmail)}</Email>`:""}
      </Contact>
      ${orgClean?`<TaxRegistration>
        <TaxRegistrationNumber>${t35("NO"+orgClean+"MVA")}</TaxRegistrationNumber>
        <TaxAuthority>Skatteetaten</TaxAuthority>
      </TaxRegistration>`:""}
      ${coBank?`<BankAccount>
        <BankAccountNumber>${t35(coBank)}</BankAccountNumber>
        <CurrencyCode>NOK</CurrencyCode>
      </BankAccount>`:""}
    </Company>
    <DefaultCurrencyCode>NOK</DefaultCurrencyCode>
    <SelectionCriteria>
      <SelectionStartDate>${dateFrom}</SelectionStartDate>
      <SelectionEndDate>${dateTo}</SelectionEndDate>
    </SelectionCriteria>
    <HeaderComment>SAF-T Financial 1.3 export from RedRock Ledger.</HeaderComment>
    <TaxAccountingBasis>A</TaxAccountingBasis>
    ${userEmail?`<UserID>${t256(userEmail)}</UserID>`:""}
  </Header>
  <MasterFiles>
    <GeneralLedgerAccounts>
${glAccountsXml}
    </GeneralLedgerAccounts>
    ${customersXml?`<Customers>\n${customersXml}\n    </Customers>`:""}
    ${suppliersXml?`<Suppliers>\n${suppliersXml}\n    </Suppliers>`:""}
    <TaxTable>
      <TaxTableEntry>
        <TaxType>MVA</TaxType>
        <Description>Merverdiavgift</Description>
${taxCodeDetailsXml}
      </TaxTableEntry>
    </TaxTable>${projects.length?`
    <AnalysisTypeTable>
${projects.map(p=>`      <AnalysisTypeTableEntry>
        <AnalysisType>P</AnalysisType>
        <AnalysisTypeDescription>Prosjekt</AnalysisTypeDescription>
        <AnalysisID>${t35(p.number||p.id)}</AnalysisID>
        <AnalysisIDDescription>${t256(p.name||p.id)}</AnalysisIDDescription>
      </AnalysisTypeTableEntry>`).join("\n")}
    </AnalysisTypeTable>`:""}
  </MasterFiles>
  <GeneralLedgerEntries>
    <NumberOfEntries>${numberOfEntries}</NumberOfEntries>
    <TotalDebit>${money(totalDebit)}</TotalDebit>
    <TotalCredit>${money(totalCredit)}</TotalCredit>
    <Journal>
      <JournalID>GL</JournalID>
      <Description>Hovedbok ${dateFrom} - ${dateTo}</Description>
      <Type>GL</Type>
${transactionsXml}
    </Journal>
  </GeneralLedgerEntries>
</AuditFile>
`;
}

export { xmlEsc, balAtDate, dayBefore };
