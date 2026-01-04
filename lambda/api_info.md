# This document keeps track of which APIs are calling which lambda functions in /lambda
# As of now the NEW links shall be used. old links are present to help replace. All links now use the same subdomain to clean up.
inspections.py
    old: https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev
    new: https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev/inspections

create_inspection.py
    old: https://resmj1r6l5.execute-api.ap-southeast-1.amazonaws.com/dev
    new: https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev/inspections-create

create_venue.py
    old: https://mt8t6krmk8.execute-api.ap-southeast-1.amazonaws.com/dev
    new: https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev/venues-create

delete_inspection.py
    old: https://cj1nbczcqk.execute-api.ap-southeast-1.amazonaws.com/dev
    new: https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev/inspections-delete
    NOTE: Now supports `cascade: true` in the body to remove associated S3 objects and image metadata before deleting the inspection. Response includes `summary` with `deletedImages` and `imageFailures`.

get_inspection.py
    old: https://9d812k40eb.execute-api.ap-southeast-1.amazonaws.com/dev
    new: https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev/inspections-query

get_venues.py
    old: https://n7yxt09phk.execute-api.ap-southeast-1.amazonaws.com/dev
    new: https://lh3sbophl4.execute-api.ap-southeast-1.amazonaws.com/dev/venues-query